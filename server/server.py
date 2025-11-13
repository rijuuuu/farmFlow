import os
import uuid
import time
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_pymongo import PyMongo
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from web3 import Web3
from src.vectorstore import FaissVectorStore
from src.search import RAGSearch

load_dotenv()

app = Flask(__name__)
CORS(app)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/krishiMitra")
app.config["MONGO_URI"] = MONGO_URI
mongo = PyMongo(app)

INFURA_URL = os.getenv("INFURA_URL")
PRIVATE_KEY = os.getenv("PRIVATE_KEY")
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS")
# PORT = int(os.getenv("PORT", "5000"))

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

def get_web3():
    if not INFURA_URL:
        raise RuntimeError("INFURA_URL is not set in environment.")
    w3 = Web3(Web3.HTTPProvider(INFURA_URL))
    # web3.py usage: is_connected() in modern versions
    try:
        connected = getattr(w3, "is_connected", None)
        if callable(connected):
            ok = w3.is_connected()
        else:
            ok = w3.isConnected()  # fallback for older versions
    except Exception:
        ok = False
    if not ok:
        raise RuntimeError("Could not connect to blockchain provider.")
    return w3

def create_blockchain_deal(crop, region, price, farmer_address=None, seller_address=None):
    if not PRIVATE_KEY or not CONTRACT_ADDRESS:
        print("Blockchain config missing (PRIVATE_KEY or CONTRACT_ADDRESS).")
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
    except Exception as e:
        print("Blockchain error:", e)
        return None

def load_sellers(path="data/FPC_sample_alipurduar.csv"):
    try:
        df = pd.read_csv(path, encoding="utf-8")
    except FileNotFoundError:
        print(f"[WARN] Seller file not found at {path}. Returning empty DataFrame.")
        df = pd.DataFrame(columns=["FPC_Name", "District", "Commodities", "Email", "Address", "Contact_Phone"])
    except UnicodeDecodeError:
        df = pd.read_csv(path, encoding="cp1252")
    df.columns = [c.strip().replace(" ", "_") for c in df.columns]
    if "FPC_Name" not in df.columns:
        df["FPC_Name"] = ""
    df["seller_id"] = df["FPC_Name"].fillna("").astype(str).str.replace(r"[^a-zA-Z0-9]", "", regex=True)
    for col in ["District", "Commodities", "Email", "Address", "Contact_Phone"]:
        if col not in df:
            df[col] = ""
        else:
            df[col] = df[col].fillna("")
    return df

SELLERS = load_sellers()

def train_vectorizer(df):
    df["combined_text"] = (
        df["FPC_Name"].fillna("") + " " +
        df["District"].fillna("") + " " +
        df["Commodities"].fillna("") + " " +
        df["Address"].fillna("")
    )
    vec = TfidfVectorizer(stop_words="english")
    if df["combined_text"].shape[0] == 0:
        mat = np.zeros((0, 0))
    else:
        mat = vec.fit_transform(df["combined_text"])
    return vec, mat

VEC, MAT = train_vectorizer(SELLERS)
REQUESTS, NOTIFS, CHATS = [], [], []

print("[INFO] Initializing Agro RAG Chatbot...")
store = None
rag = None
try:
    store = FaissVectorStore("faiss_store")
    store.load()
    rag = RAGSearch(vector_store=store)
    print("[INFO] RAG store loaded.")
except Exception as e:
    print("[WARN] Could not load Faiss store or initialize RAG. Continuing without RAG. Error:", e)

conversation_histories = {}  # keyed by room

@app.route('/')
def home():
    return "🌾 Welcome to AgriConnect + KrishiMitra API!"

@app.route('/signUp', methods=['POST'])
def signUp():
    data = request.get_json() or {}
    uniqueID = data.get("uniqueID")
    email = data.get("email")
    password = data.get("password")

    if not uniqueID or not email or not password:
        return jsonify({"error": "Missing fields"}), 400

    if mongo.db.users.find_one({'_id': uniqueID}) or mongo.db.users.find_one({'email': email}):
        return jsonify({"error": "This ID or email is already taken."}), 400

    hashed_password = generate_password_hash(password)
    mongo.db.users.insert_one({
        "_id": uniqueID,
        "email": email,
        "password": hashed_password
    })

    return jsonify({"message": "Signup successful!", "user": uniqueID}), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    uniqueID = str(data.get("uniqueID"))
    password = data.get("password")

    if not uniqueID or not password:
        return jsonify({"error": "Missing fields"}), 400

    user = mongo.db.users.find_one({'_id': uniqueID})
    if not user:
        return jsonify({"error": "Invalid userID."}), 400

    if not check_password_hash(user["password"], password):
        return jsonify({"error": "Wrong password."}), 400

    return jsonify({"message": "Login successful!", "user": uniqueID}), 200

@app.route('/chatbot', methods=['POST'])
def chatbot():
    try:
        if rag is None:
            return jsonify({"error": "RAG not available"}), 503
        data = request.get_json() or {}
        user_input = data.get("message", "").strip()
        room = data.get("room", "global")
        if not user_input:
            return jsonify({"error": "Empty message"}), 400

        history = conversation_histories.setdefault(room, [])
        chat_context = "\n".join([f"User: {q}\nAssistant: {a}" for q, a in history[-5:]])

        start_time = time.time()
        answer = rag.search_and_summarize(user_input, top_k=3, chat_context=chat_context)
        elapsed = time.time() - start_time

        history.append((user_input, answer))
        # keep history size reasonable
        if len(history) > 200:
            conversation_histories[room] = history[-200:]

        return jsonify({
            "reply": answer,
            "response_time": f"{elapsed:.2f}s"
        }), 200

    except Exception as e:
        print(f"[ERROR] Chatbot exception: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.post("/api/recommend")
def recommend():
    data = request.get_json() or {}
    crop = (data.get("crop") or "").strip()
    region = (data.get("region") or "").strip()
    query = f"{crop} {region}".strip()

    if not query:
        out = SELLERS.head(10).copy()
        out["match_score"] = 0.0
    else:
        try:
            qv = VEC.transform([query])
            if hasattr(MAT, "shape") and MAT.shape[0] > 0:
                sims = cosine_similarity(qv, MAT).flatten()
            else:
                sims = np.zeros(len(SELLERS))
        except Exception as e:
            print("[WARN] vectorizer transform failed:", e)
            sims = np.zeros(len(SELLERS))

        out = SELLERS.copy()
        out["match_score"] = (sims * 100).round(2)
        out = out.sort_values("match_score", ascending=False).head(15)

    records = out[["FPC_Name", "District", "Commodities", "Email", "Contact_Phone", "match_score"]].to_dict(orient="records")
    return jsonify(records), 200

@app.post("/api/request")
def create_request():
    data = request.get_json() or {}
    farmer_id = data.get("farmer_id")
    farmer_name = data.get("farmer_name")
    crop = data.get("crop")
    region = data.get("region")
    price = data.get("price", 0)
    seller_id = data.get("seller_id")

    if not farmer_id or not farmer_name or not crop or not region or seller_id is None:
        return jsonify({"error": "Missing required fields"}), 400

    try:
        price_int = int(price)
    except Exception:
        price_int = 0

    rid = str(uuid.uuid4())
    req = {
        "id": rid,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "farmer_id": farmer_id,
        "farmer_name": farmer_name,
        "crop": crop,
        "region": region,
        "price": price_int,
        "seller_id": seller_id,
        "status": "pending",
    }
    REQUESTS.append(req)
    NOTIFS.append({
        "to": req["seller_id"],
        "msg": f"Farmer {req['farmer_name']} wants to connect for {req['crop']} in {req['region']}"
    })
    return jsonify({"ok": True, "request_id": rid}), 201

@app.get("/api/requests")
def list_requests():
    farmer_id = request.args.get("farmer_id")
    seller_id = request.args.get("seller_id")
    results = REQUESTS
    if farmer_id:
        results = [r for r in results if r.get("farmer_id") == farmer_id]
    if seller_id:
        results = [r for r in results if r.get("seller_id") == seller_id]
    return jsonify(results)

@app.get("/api/notifications")
def notifications():
    seller = request.args.get("seller")
    return jsonify([n for n in NOTIFS if n.get("to") == seller])

@app.post("/api/accept/<rid>")
def accept_request(rid):
    for r in REQUESTS:
        if r["id"] == rid and r["status"] == "pending":
            tx = create_blockchain_deal(r["crop"], r["region"], r["price"], farmer_address=r.get("farmer_address"), seller_address=r.get("seller_address"))
            r["status"] = "accepted"
            r["tx_hash"] = tx
            return jsonify({"ok": True, "tx_hash": tx})
    return jsonify({"ok": False}), 404

@app.post("/api/reject/<rid>")
def reject_request(rid):
    for r in REQUESTS:
        if r["id"] == rid and r["status"] == "pending":
            r["status"] = "rejected"
            return jsonify({"ok": True})
    return jsonify({"ok": False}), 404

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
        "sender": sender,
        "receiver": receiver,
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
    return jsonify(messages)

if __name__ == "__main__":
    app.run(debug=True)
