import os
import uuid
import re
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_pymongo import PyMongo
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
from web3 import Web3

# New import for BM25
from rank_bm25 import BM25Okapi
import warnings

import pandas as pd
import numpy as np
import requests

from src.scheme_engine.engine import recommend_scheme_single, df as SCHEME_DF


warnings.filterwarnings("ignore")

try:
    from src.vectorstore import FaissVectorStore
    from src.search import RAGSearch
except Exception:
    FaissVectorStore = None
    RAGSearch = None

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"*": {"origins": "*"}})

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/krishiMitra")
app.config["MONGO_URI"] = MONGO_URI
mongo = PyMongo(app)

INFURA_URL = os.getenv("INFURA_URL")
PRIVATE_KEY = os.getenv("PRIVATE_KEY")
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS")
PORT = int(os.getenv("PORT", "5000"))
OPENWEATHER_KEY = os.getenv("OPENWEATHER_KEY")

ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "farmer", "type": "address"},
            {"internalType": "address", "name": "seller", "type": "address"},
            {"internalType": "string", "name": "crop", "type": "string"},
            {"internalType": "string", "name": "region", "type": "string"},
            {"internalType": "uint256", "name": "price", "type": "uint256"},
        ],
        "name": "createDeal",
        "outputs": [{"internalType": "bytes32", "name": "dealId", "type": "bytes32"}],
        "stateMutability": "nonpayable",
        "type": "function",
    }
]

def clean_alphanumeric(t: str) -> str:
    t_str = str(t or "").lower()
    cleaned = ""
    for char in t_str:
        if char.isalnum():
            cleaned += char
    return cleaned

def get_web3():
    if not INFURA_URL:
        raise RuntimeError("INFURA_URL is not set in environment.")
    w3 = Web3(Web3.HTTPProvider(INFURA_URL))
    try:
        ok = w3.is_connected()
    except Exception:
        ok = False
    if not ok:
        raise RuntimeError("Cannot connect to blockchain provider.")
    return w3

def create_blockchain_deal(crop, region, price, farmer_address=None, seller_address=None):
    if not PRIVATE_KEY or not CONTRACT_ADDRESS:
        return None
    try:
        w3 = get_web3()
        acct = w3.eth.account.from_key(PRIVATE_KEY)
        farmer_addr = farmer_address or acct.address
        seller_addr = seller_address or acct.address
        contract = w3.eth.contract(address=w3.to_checksum_address(CONTRACT_ADDRESS), abi=ABI)
        nonce = w3.eth.get_transaction_count(acct.address)
        gas_price = w3.to_wei("10", "gwei")
        txn = contract.functions.createDeal(
            w3.to_checksum_address(farmer_addr),
            w3.to_checksum_address(seller_addr),
            str(crop),
            str(region),
            int(price)
        ).build_transaction({
            "from": acct.address,
            "nonce": nonce,
            "gas": 300000,
            "gasPrice": gas_price,
        })
        signed = acct.sign_transaction(txn)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        return tx_hash.hex()
    except Exception:
        return None

CHATS = []

rag = None
if FaissVectorStore is not None and RAGSearch is not None:
    try:
        store = FaissVectorStore("faiss_store")
        store.load()
        rag = RAGSearch(vector_store=store)
    except Exception:
        rag = None

# -------------------------
# Recommendation helpers
# -------------------------

def preprocess_text_for_bm25(text):
    t = str(text or "").lower()
    t = re.sub(r'[^a-z0-9\s]', ' ', t)
    tokens = [tok for tok in t.split() if tok]
    return tokens

def build_seller_docs_from_db():
    sellers_cursor = mongo.db.users.find({"role": {"$regex": "^seller$", "$options": "i"}})
    sellers = []
    corpus = []
    for s in sellers_cursor:
        seller = {}
        seller['_id'] = s.get("_id")
        seller['fpcName'] = s.get("fpcName") or s.get("fpc_name") or s.get("_id")
        seller['district'] = s.get("district", "")
        comms = s.get("commodities", [])
        if isinstance(comms, list):
            commodities_str = ", ".join([str(x) for x in comms if x])
        else:
            commodities_str = str(comms)
        seller['commodities'] = commodities_str
        seller['address'] = s.get("address", "") or s.get("Address", "")
        seller['contact_phone'] = s.get("contact_phone", "") or s.get("Contact_Phone", "")
        try:
            # Handle rating as string or number
            rating_value = s.get("rating") or s.get("Rating") or 5
            seller['rating'] = float(rating_value) if rating_value is not None else 5.0
        except Exception:
            seller['rating'] = 5.0
        try:
            # Check for experience field (as stored in MongoDB) or years_of_experience
            exp_value = s.get("experience") or s.get("years_of_experience") or s.get("Years_of_Experience") or 5
            seller['years_of_experience'] = float(exp_value) if exp_value is not None else 5.0
        except Exception:
            seller['years_of_experience'] = 5.0

        sellers.append(seller)

        doc_text = f"{seller['fpcName']} {seller['district']} {seller['commodities']} {seller['address']}"
        corpus.append(preprocess_text_for_bm25(doc_text))

    bm25 = BM25Okapi(corpus) if corpus else None
    return sellers, bm25

def district_similarity_score(farmer_district, seller_district):
    farmer_district = str(farmer_district or "").lower().strip()
    seller_district = str(seller_district or "").lower().strip()
    if not farmer_district or not seller_district:
        return 0.3
    if farmer_district == seller_district:
        return 1.0
    if farmer_district in seller_district or seller_district in farmer_district:
        return 0.7
    return 0.3

def commodity_match_score(query_crops, seller_commodities):
    query_crops = [c.strip().lower() for c in str(query_crops or "").split(",") if c.strip()]
    seller_commodities = str(seller_commodities or "").lower()
    if not query_crops:
        return 0.5
    matches = sum(1 for crop in query_crops if crop in seller_commodities)
    return min(matches / len(query_crops), 1.0)

def normalize_value(val, min_val, max_val):
    if max_val == min_val:
        return 0.5
    try:
        return (val - min_val) / (max_val - min_val)
    except Exception:
        return 0.5
    
    
def is_central_ministry(text: str) -> bool:
    text = text.lower()
    return text.startswith("ministry of") or "government of india" in text


def get_next_best_scheme(crop: str, state: str, exclude_list):
    crop = crop.lower().strip()
    state = state.lower().strip()

    try:
        engine_res = recommend_scheme_single(crop, state)
        best_name = engine_res["scheme_name"]
    except:
        engine_res = None
        best_name = None

    if engine_res and best_name not in exclude_list:
        return engine_res

    df = SCHEME_DF.copy()
    df = df[~df["scheme_name"].isin(exclude_list)]

    if df.empty:
        return None

    scores = []

    for _, row in df.iterrows():
        score = 0
        desc = row["description"].lower()
        tags = row["tags"].lower()
        sm = row["state_ministry"].lower()
        name = row["scheme_name"].lower()

        if state in sm:
            score += 8000
        elif is_central_ministry(sm):
            score += 3000
        else:
            score -= 4000

        if crop in name:
            score += 500
        if crop in desc:
            score += 300
        if crop in tags:
            score += 200

        scores.append((score, row))

    scores.sort(key=lambda x: x[0], reverse=True)
    best_score, best_row = scores[0]

    return {
        "scheme_name": best_row["scheme_name"],
        "state_ministry": best_row["state_ministry"],
        "description": best_row["description"],
        "tags": best_row["tags"],
        "scheme_link": best_row.get("scheme_link", ""),
        "score": float(best_score),
    }

# -------------------------
# End recommendation helpers
# -------------------------

@app.post("/signUp")
def signUp():
    data = request.get_json() or {}
    uid = data.get("uniqueID")
    email = data.get("email")
    password = data.get("password")
    role = data.get("role")
    state = data.get("state")

    if not uid or not email or not password or not role or not state:
        return jsonify({"error": "Missing required general fields"}), 400

    clean_uid = clean_alphanumeric(uid)

    if mongo.db.users.find_one({"_id": clean_uid}) or mongo.db.users.find_one({"email": email}):
        return jsonify({"error": "This ID or email is already taken."}), 400

    hashed = generate_password_hash(password)

    user_doc = {
        "_id": clean_uid, "email": email, "password": hashed, "role": role, "state": state
    }

    if role.lower() == "seller":
        fpc_name = data.get("fpcName") or data.get("fpc_name")
        district = data.get("district")
        experience = data.get("experience")
        commodities = data.get("commodities")
        if not all([fpc_name, district, experience, commodities]):
            return jsonify({"error": "Seller details (FPC, District, Experience, Commodities) are missing."}), 400
        user_doc.update({
            "fpcName": fpc_name,
            "district": district,
            "experience": experience,
            "commodities": [c.strip() for c in commodities if c.strip()],
        })

    try:
        mongo.db.users.insert_one(user_doc)
        return jsonify({"message": "Signup successful", "user": uid}), 201
    except Exception as e:
        print(f"MongoDB Signup Error: {e}")
        return jsonify({"error": "Failed to create user due to a database issue."}), 500

@app.post("/login")
def login():
    data = request.get_json() or {}
    uid = data.get("uniqueID")
    pw = data.get("password")
    if not uid or not pw:
        return jsonify({"error": "Missing fields"}), 400

    clean_uid = clean_alphanumeric(uid)

    user = mongo.db.users.find_one({"_id": clean_uid})
    if not user:
        return jsonify({"error": "Invalid userID"}), 400
    if not check_password_hash(user["password"], pw):
        return jsonify({"error": "Wrong password"}), 400

    response_data = {
        "message": "Login successful",
        "user": uid,
        "role": user.get("role")
    }

    if user.get("role", "").lower() == "seller":
        response_data["fpc_name"] = user.get("fpcName")
    return jsonify(response_data), 200

# -------------------------
# Replaced /api/recommend
# -------------------------
@app.post("/api/recommend")
def recommend():
    """
    Advanced recommendation system using:
    - BM25 for semantic search
    - Rating boost (highest priority - 40%)
    - District matching (high priority - 25%)
    - Commodity matching (base requirement - 20%)
    - Years of experience (moderate priority - 10%)
    - BM25 semantic search (5%)
    """
    try:
        data = request.get_json() or {}
        crop_input = data.get("crop", "").strip()
        district_input = data.get("district", "").strip()
        state_input = data.get("state", "").strip()
        
        # Fallback for backward compatibility
        if not district_input:
            district_input = data.get("region", "").strip()

        # Step 1: Get all sellers and build BM25 corpus (only once)
        all_sellers, bm25_model = build_seller_docs_from_db()
        
        if not all_sellers:
            return jsonify([]), 200

        # Step 2: Filter by commodity (base requirement)
        crop_keywords = [c.strip().lower() for c in crop_input.split(",") if c.strip()]
        matched_sellers = []
        
        if crop_keywords:
            # Filter sellers that have at least one matching commodity
            for seller in all_sellers:
                seller_commodities_str = str(seller.get("commodities", "")).lower()
                if any(keyword in seller_commodities_str for keyword in crop_keywords):
                    matched_sellers.append(seller)
        else:
            # If no crop specified, include all sellers
            matched_sellers = all_sellers

        if not matched_sellers:
            return jsonify([]), 200

        # Step 3: Calculate BM25 scores
        query = f"{crop_input} {district_input} {state_input}".strip()
        tokenized_query = preprocess_text_for_bm25(query)
        
        # Get BM25 scores for all sellers in corpus, then map to matched sellers
        bm25_scores_dict = {}
        if bm25_model and len(all_sellers) > 0:
            all_scores = bm25_model.get_scores(tokenized_query)
            for idx, seller in enumerate(all_sellers):
                seller_id = seller.get("_id")
                if seller_id:
                    bm25_scores_dict[seller_id] = all_scores[idx] if idx < len(all_scores) else 0.0

        # Step 4: Calculate component scores for each matched seller
        for seller in matched_sellers:
            seller_id = seller.get("_id")
            
            # BM25 score
            bm25_score = bm25_scores_dict.get(seller_id, 0.0)
            seller["bm25_score"] = bm25_score
            
            # District similarity score
            seller["district_score"] = district_similarity_score(
                district_input, 
                seller.get("district", "")
            )
            
            # Commodity match score
            seller["commodity_score"] = commodity_match_score(
                crop_input,
                seller.get("commodities", "")
            )

        # Step 5: Normalize scores
        ratings = [s.get("rating", 5.0) for s in matched_sellers]
        experiences = [s.get("years_of_experience", 5.0) for s in matched_sellers]
        bm25_scores = [s.get("bm25_score", 0.0) for s in matched_sellers]
        
        min_rating = min(ratings) if ratings else 5.0
        max_rating = max(ratings) if ratings else 5.0
        min_exp = min(experiences) if experiences else 5.0
        max_exp = max(experiences) if experiences else 5.0
        max_bm25 = max(bm25_scores) if bm25_scores and max(bm25_scores) > 0 else 1.0

        for seller in matched_sellers:
            seller["rating_norm"] = normalize_value(
                seller.get("rating", 5.0),
                min_rating,
                max_rating
            )
            seller["experience_norm"] = normalize_value(
                seller.get("years_of_experience", 5.0),
                min_exp,
                max_exp
            )
            seller["bm25_norm"] = (seller.get("bm25_score", 0.0) / max_bm25) if max_bm25 > 0 else 0.5

        # Step 6: Calculate final weighted score
        # Weights: Rating (40%), District (25%), Commodity (20%), Experience (10%), BM25 (5%)
        for seller in matched_sellers:
            seller["final_score"] = (
                seller.get("rating_norm", 0.5) * 0.40 +
                seller.get("district_score", 0.3) * 0.25 +
                seller.get("commodity_score", 0.5) * 0.20 +
                seller.get("experience_norm", 0.5) * 0.10 +
                seller.get("bm25_norm", 0.5) * 0.05
            )

        # Step 7: Sort by final score (descending)
        matched_sellers.sort(key=lambda x: x.get("final_score", 0.0), reverse=True)

        # Step 8: Prepare output
        result = []
        for seller in matched_sellers:
            commodities = seller.get("commodities", "")
            if isinstance(commodities, list):
                commodities_str = ", ".join([str(c) for c in commodities if c])
            else:
                commodities_str = str(commodities)
            
            match_percentage = round(seller.get("final_score", 0.0) * 100, 1)
            
            result.append({
                "FPC_Name": seller.get("fpcName", seller.get("_id", "")),
                "District": seller.get("district", ""),
                "Commodities": commodities_str,
                "Rating": seller.get("rating", 5.0),
                "Years_of_Experience": seller.get("years_of_experience", 5.0),
                "Contact_Phone": seller.get("contact_phone", ""),
                "Address": seller.get("address", ""),
                "match_percentage": match_percentage,
                # Additional fields for backward compatibility
                "fpc_name": seller.get("fpcName", seller.get("_id", "")),
                "fpc_id": seller.get("_id", "")
            })

        return jsonify(result), 200

    except Exception as e:
        print("RECOMMENDATION ERROR:", e)
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Recommendation failed"}), 500

# -------------------------
# Rest of the API (updated create_request + list_requests)
# -------------------------
@app.post("/api/request")
def create_request():
    data = request.get_json() or {}
    # Accept fpc_id if provided; otherwise try to resolve by fpc_name
    provided_fpc_id = data.get("fpc_id")
    fpc_value_raw = data.get("fpc_name") or data.get("fpcName") or ""
    fpc_value = str(fpc_value_raw).strip()
    farmer_id = clean_alphanumeric(data.get("farmer_id"))
    required = ["farmer_name", "crop", "region", "price"]
    if not fpc_value and not provided_fpc_id:
        return jsonify({"error": "Missing fpc identifier (name or id)"}), 400
    if not all(k in data for k in required):
        return jsonify({"error": "Missing fields"}), 400
    try:
        price_int = int(float(data.get("price")))
    except:
        return jsonify({"error": "Price must be a number"}), 400

    # Normalize and find seller user if fpc_id not provided
    fpc_id = None
    fpc_name_store = fpc_value  # store as provided (original casing)
    if provided_fpc_id:
        fpc_id = clean_alphanumeric(provided_fpc_id)
        # try to fetch actual display name if exists
        seller_user = mongo.db.users.find_one({"_id": fpc_id})
        if seller_user and seller_user.get("fpcName"):
            fpc_name_store = seller_user.get("fpcName")
    else:
        # try find seller by fpcName (case-insensitive, trim)
        if fpc_value:
            seller_user = mongo.db.users.find_one({"fpcName": {"$regex": f"^{re.escape(fpc_value)}$", "$options": "i"}})
            if not seller_user:
                # fallback: partial match
                seller_user = mongo.db.users.find_one({"fpcName": {"$regex": f"{re.escape(fpc_value)}", "$options": "i"}})
            if seller_user:
                fpc_id = seller_user.get("_id")
                fpc_name_store = seller_user.get("fpcName", fpc_value)

    request_id = str(uuid.uuid4())
    req_doc = {
        "id": request_id,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "farmer_id": farmer_id,
        "farmer_name": data.get("farmer_name"),
        "crop": data.get("crop"),
        "region": data.get("region"),
        "price": price_int,
        "fpc_name": fpc_name_store,
        "fpc_id": fpc_id,
        "status": "pending"
    }

    try:
        mongo.db.requests.insert_one(req_doc)
        notification_doc = {
            "id": str(uuid.uuid4()),
            "to": fpc_name_store,
            "msg": f"Farmer {data.get('farmer_name')} wants to connect for {data.get('crop')} in {data.get('region')}",
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "read": False,
            "request_id": request_id
        }
        mongo.db.notifications.insert_one(notification_doc)
        return jsonify({"ok": True, "request_id": request_id}), 201
    except Exception as e:
        print(f"MongoDB Request Insert Error: {e}")
        return jsonify({"error": "Failed to store request in DB."}), 500

@app.get("/api/requests")
def list_requests():
    farmer = request.args.get("farmer_id")
    fpc = request.args.get("fpc_name")
    fpc_id = request.args.get("fpc_id")
    q = {}
    if farmer:
        q["farmer_id"] = clean_alphanumeric(farmer)
    if fpc_id:
        q["fpc_id"] = clean_alphanumeric(fpc_id)
    if fpc:
        # case-insensitive substring match for flexibility
        q["fpc_name"] = {"$regex": re.escape(fpc.strip()), "$options": "i"}
    try:
        data = list(mongo.db.requests.find(q, {"_id": 0}))
        return jsonify(data), 200
    except Exception as e:
        print(f"Request fetch error: {e}")
        return jsonify({"error": "Failed to fetch requests"}), 500

@app.post("/api/accept/<rid>")
def accept_request(rid):
    try:
        result = mongo.db.requests.find_one({"id": rid})
        if result and result["status"] == "pending":
            tx = create_blockchain_deal(result["crop"], result["region"], result["price"])
            update_result = mongo.db.requests.update_one(
                {"id": rid},
                {"$set": {"status": "accepted", "tx_hash": tx}}
            )
            mongo.db.notifications.update_many(
                {"request_id": rid},
                {"$set": {"read": True}}
            )
            if update_result.modified_count > 0:
                return jsonify({"ok": True, "tx_hash": tx}), 200
    except Exception as e:
        print(f"Accept error: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500
    return jsonify({"ok": False}), 404

@app.post("/api/reject/<rid>")
def reject_request(rid):
    try:
        update_result = mongo.db.requests.update_one(
            {"id": rid, "status": "pending"},
            {"$set": {"status": "rejected"}}
        )
        mongo.db.notifications.update_many(
            {"request_id": rid},
            {"$set": {"read": True}}
        )
        if update_result.modified_count > 0:
            return jsonify({"ok": True}), 200
    except Exception as e:
        print(f"Reject error: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500
    return jsonify({"ok": False}), 404

@app.post("/api/request/delete/<rid>")
def delete_request(rid):
    try:
        req = mongo.db.requests.find_one({"id": rid})
        if not req:
            return jsonify({"ok": False, "error": "Request not found"}), 404
        farmer_id = req.get("farmer_id")
        fpc_id = req.get("fpc_id")
        mongo.db.requests.delete_one({"id": rid})
        mongo.db.notifications.delete_many({"request_id": rid})
        room1 = f"{farmer_id}_{fpc_id}" if farmer_id and fpc_id else None
        room2 = f"{fpc_id}_{farmer_id}" if farmer_id and fpc_id else None
        global CHATS
        CHATS = [m for m in CHATS if not (m.get("room") == room1 or m.get("room") == room2)]
        return jsonify({"ok": True}), 200
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.get("/api/notifications")
def notifications():
    fpc_name_input = request.args.get("fpc_name")
    if not fpc_name_input:
        return jsonify([]), 200
    normalized = fpc_name_input.strip()
    try:
        notifs = list(mongo.db.notifications.find(
            {"to": {"$regex": f"{re.escape(normalized)}", "$options": "i"}},
            {"_id": 0}
        ).sort("timestamp", -1))
        return jsonify(notifs), 200
    except Exception as e:
        print(f"Notification fetch error: {e}")
        return jsonify({"error": "Failed to fetch notifications"}), 500

@app.post("/api/chat/send")
def send_message():
    data = request.get_json() or {}
    sender = data.get("sender")
    receiver = data.get("receiver")
    text = data.get("text")
    room = data.get("room")
    if not sender or not receiver or not text or not room:
        return jsonify({"ok": False, "error": "Missing sender/receiver/text/room"}), 400
    msg = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "sender": str(sender),
        "receiver": str(receiver),
        "text": text,
        "room": room,
    }
    CHATS.append(msg)
    return jsonify({"ok": True, "msg": msg}), 201

@app.get("/api/chat/history")
def chat_history():
    room = request.args.get("room")
    if not room:
        return jsonify({"ok": False, "error": "room required"}), 400
    messages = [m for m in CHATS if m.get("room") == room]
    return jsonify(messages), 200

@app.post("/chatbot")
def chatbot():
    if rag is None:
        return jsonify({"error": "RAG not ready"}), 503
    data = request.get_json() or {}
    user_input = (data.get("message") or "").strip()
    if not user_input:
        return jsonify({"error": "Empty message"}), 400
    try:
        ans = rag.search_and_summarize(user_input)
        return jsonify({"reply": ans}), 200
    except Exception:
        return jsonify({"error": "RAG search failed"}), 500

@app.post("/api/crops/add")
def add_crop():
    data = request.get_json() or {}
    userID = data.get("userID")
    text = data.get("text")
    date = data.get("date")
    if not userID or not text or not date:
        return jsonify({"error": "Missing fields"}), 400
    mongo.db.crops.insert_one({
        "userID": userID,
        "text": text,
        "date": date
    })
    return jsonify({"message": "Crop saved"}), 201

@app.get("/api/crops/get")
def get_crops():
    userID = request.args.get("userID")
    if not userID:
        return jsonify({"error": "userID required"}), 400
    crops = list(mongo.db.crops.find({"userID": userID}, {"_id": 0}))
    return jsonify(crops), 200

@app.get("/api/user")
def get_user():
    uid = request.args.get("id")
    if not uid:
        return jsonify({"error": "id required"}), 400

    clean_uid = clean_alphanumeric(uid)
    user = mongo.db.users.find_one({"_id": clean_uid}, {"_id": 0})

    if not user:
        return jsonify({"error": "User not found"}), 404

    return jsonify(user), 200


# ============================================================
# WEATHER ENDPOINTS (FROM FILE O)
# ============================================================
@app.get("/api/weather/forecast")
def weather_forecast():
    lat = request.args.get("lat")
    lon = request.args.get("lon")

    if not lat or not lon:
        return jsonify({"error": "Missing coordinates"}), 400

    if not OPENWEATHER_KEY:
        return jsonify({"error": "Missing OpenWeather key"}), 500

    url = (
        f"https://api.openweathermap.org/data/2.5/forecast?"
        f"lat={lat}&lon={lon}&appid={OPENWEATHER_KEY}&units=metric"
    )

    try:
        r = requests.get(url)
        data = r.json()

        if "list" not in data:
            return jsonify({"error": "OpenWeather error", "details": data}), 500

        return jsonify({"forecast": data["list"]}), 200

    except Exception as e:
        print("WEATHER FORECAST ERROR:", e)
        return jsonify({"error": str(e)}), 500


@app.get("/api/weather/current")
def weather_current():
    lat = request.args.get("lat")
    lon = request.args.get("lon")

    if not lat or not lon:
        return jsonify({"error": "Missing coordinates"}), 400

    if not OPENWEATHER_KEY:
        return jsonify({"error": "Missing OpenWeather key"}), 500

    url = (
        f"https://api.openweathermap.org/data/2.5/weather?"
        f"lat={lat}&lon={lon}&appid={OPENWEATHER_KEY}&units=metric"
    )

    try:
        r = requests.get(url)
        data = r.json()

        result = {
            "temp": data["main"]["temp"],
            "humidity": data["main"]["humidity"],
            "rain": data.get("rain", {}).get("1h", 0),
            "condition": data["weather"][0]["description"],
            "icon": data["weather"][0]["icon"]
        }

        return jsonify(result), 200

    except Exception as e:
        print("CURRENT WEATHER ERROR:", e)
        return jsonify({"error": str(e)}), 500


# ============================================================
# GOV SCHEME ENDPOINTS (FROM FILE O)
# ============================================================
@app.post("/api/scheme/bycrop")
def scheme_bycrop():
    data = request.get_json() or {}
    crop = data.get("crop", "").strip()
    state = data.get("state", "").strip()
    shown = data.get("shown_schemes", [])

    scheme_dict = get_next_best_scheme(crop, state, shown)

    if scheme_dict is None:
        return jsonify({"error": "No scheme available"}), 404

    return jsonify({"recommended_scheme": scheme_dict}), 200


@app.post("/api/scheme/auto")
def scheme_auto():
    data = request.get_json() or {}
    userID = data.get("userID")
    shown = data.get("shown_schemes", [])

    user = mongo.db.users.find_one({"_id": userID})
    if not user:
        return jsonify({"error": "User not found"}), 404

    state = user["state"]

    latest_crop = list(mongo.db.crops.find({"userID": userID}).sort("date", -1).limit(1))
    if not latest_crop:
        return jsonify({"error": "No crop entries"}), 404

    crop = latest_crop[0]["text"]

    scheme_dict = get_next_best_scheme(crop, state, shown)

    if scheme_dict is None:
        return jsonify({"error": "No scheme available"}), 404

    return jsonify({
        "crop": crop,
        "state": state,
        "recommended_scheme": scheme_dict
    }), 200


# ============================================================
# SIMPLE SELLERS API (ONLY FROM FILE O)
# ============================================================
@app.get("/api/sellers")
def get_sellers():
    state = request.args.get("state")
    if not state:
        return jsonify({"error": "State required"}), 400

    sellers = list(
        mongo.db.users.find(
            {"role": "seller", "state": state},
            {"_id": 0, "password": 0}
        )
    )
    return jsonify({"sellers": sellers}), 200


@app.get("/")
def home():
    return "🌾 AgriConnect + KrishiMitra API Running!"

@app.get("/api/health")
def health():
    return jsonify({"status": "ok"}), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=True)