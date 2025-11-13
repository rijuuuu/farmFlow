# app.py
import time
from src.vectorstore import FaissVectorStore
from src.search import RAGSearch

if __name__ == "__main__":
    print("[INFO] Starting Agro RAG Chat...")

    # Load FAISS once
    store = FaissVectorStore("faiss_store")
    store.load()

    # Initialize RAGSearch
    rag = RAGSearch(vector_store=store)

    # Keep full session memory
    conversation_history = []

    print("\n[INFO] Chat initialized. Type your questions (type 'exit' to quit)\n")

    while True:
        query = input("You: ").strip()
        if not query:
            continue
        if query.lower() == "exit":
            print("👋 Ending session. Goodbye!")
            break

        # 🧠 Use ALL past turns as chat context
        chat_context = "\n".join(
            [f"User: {q}\nAssistant: {a}" for q, a in conversation_history]
        )

        start_time = time.time()
        answer = rag.search_and_summarize(query, top_k=3, chat_context=chat_context)
        elapsed = time.time() - start_time

        print(f"\nAssistant ({elapsed:.2f}s): {answer}\n")

        # Save this turn for future context
        conversation_history.append((query, answer))












'''

# ---- Health ----
@app.get("/api/health")
def health():
    return {"status": "ok"}

# ---- Recommend ----
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

# ---- Requests / Notifications ----
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
            tx = create_blockchain_deal(r["crop"], r["region"], r["price"],
                                        farmer_address=r.get("farmer_address"), seller_address=r.get("seller_address"))
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

# ---------- Chat system (fixed) ----------
@app.post("/api/chat/send")
def send_message():
    data = request.get_json() or {}
    sender = data.get("sender")
    receiver = data.get("receiver")
    text = data.get("text")
    room = data.get("room")

    # Auto-generate a canonical room name if not provided
    # canonicalize so same room for farmer/seller irrespective of order
    if not room and sender and receiver:
        try:
            # if sender/receiver are numeric or strings, make deterministic ordering
            room = f"{min(str(sender), str(receiver))}_{max(str(sender), str(receiver))}"
        except Exception:
            room = f"{sender}_{receiver}"

    if not sender or not receiver or not text:
        return jsonify({"ok": False, "error": "Missing sender/receiver/text"}), 400

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
    # support both room param or sender+receiver pair
    room = request.args.get("room")
    sender = request.args.get("sender")
    receiver = request.args.get("receiver")

    if not room:
        if sender and receiver:
            try:
                room = f"{min(str(sender), str(receiver))}_{max(str(sender), str(receiver))}"
            except Exception:
                room = f"{sender}_{receiver}"
        else:
            return jsonify({"ok": False, "error": "room or sender+receiver required"}), 400

    messages = [m for m in CHATS if m.get("room") == room]
    return jsonify(messages)



'''