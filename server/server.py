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
            seller['rating'] = float(s.get("rating", s.get("Rating", 5))) if s.get("rating", None) is not None else 5.0
        except Exception:
            seller['rating'] = 5.0
        try:
            seller['years_of_experience'] = float(s.get("years_of_experience", s.get("Years_of_Experience", 5))) if s.get("years_of_experience", None) is not None else 5.0
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
    try:
        data = request.get_json() or {}
        crop_input = data.get("crop", "").strip()
        region_input = data.get("region", "").strip()

        search_query = {"role": "seller"}

        if crop_input:
            search_query["commodities"] = {"$regex": crop_input, "$options": "i"}

        if region_input:
            search_query["district"] = {"$regex": region_input, "$options": "i"}

        sellers = list(
            mongo.db.users.find(
                search_query,
                {"_id": 1, "fpcName": 1, "district": 1, "commodities": 1}
            )
        )

        result = []
        for s in sellers:
            fpc = s.get("fpcName") or s.get("_id")
            district = s.get("district", "Unknown")
            commodities = s.get("commodities", [])
            commodities_str = ", ".join(commodities) if isinstance(commodities, list) else str(commodities)

            result.append({
                "FPC_Name": fpc,
                "District": district,
                "Commodities": commodities_str,
                "fpc_name": fpc,
                "fpc_id": s.get("_id"),
                "crop": crop_input,
                "region": region_input
            })

        return jsonify(result), 200

    except Exception as e:
        print("RECOMMENDATION ERROR:", e)
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


@app.get("/")
def home():
    return "🌾 AgriConnect + KrishiMitra API Running!"

@app.get("/api/health")
def health():
    return jsonify({"status": "ok"}), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=True)