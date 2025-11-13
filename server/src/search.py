# src/search.py
import os
import time
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer, util
from langchain_groq import ChatGroq

from src.vectorstore import FaissVectorStore
from src.utils import AGRI_REFERENCE_TEXTS

load_dotenv()


class RAGSearch:
    def __init__(
        self,
        persist_dir: str = "faiss_store",
        embedding_model_name: str = "all-MiniLM-L6-v2",
        llm_model_name: str = "llama-3.1-8b-instant",
        vector_store=None,
        embedding_classifier_name: str = "all-MiniLM-L6-v2",
    ):
        """
        RAGSearch with Hybrid agriculture-detector and chat memory support:
         - Keyword fast-check (cheap)
         - Embedding similarity check (local)
         - LLM classifier fallback (rare)
         - Context-aware answering (uses recent conversation)
        """

        # --------------- LLM SETUP ---------------
        self.groq_api_key = os.getenv("GROQ_API_KEY", None)
        if not self.groq_api_key:
            print("[WARN] GROQ_API_KEY not set in environment. Set it in your .env file.")

        self.llm_model_name = llm_model_name
        self.llm = ChatGroq(groq_api_key=self.groq_api_key, model_name=self.llm_model_name)
        print(f"[INFO] Groq LLM initialized: {llm_model_name}")

        # --------------- VECTOR STORE ---------------
        if vector_store is not None:
            self.vectorstore = vector_store
            print("[INFO] Using existing vector store instance")
        else:
            self.vectorstore = FaissVectorStore(persist_dir, embedding_model_name)
            #COMMENT OUT AFTER FIRST RUN
            #faiss_path = os.path.join(persist_dir, "faiss.index")
            #meta_path = os.path.join(persist_dir, "metadata.pkl")
            #if not (os.path.exists(faiss_path) and os.path.exists(meta_path)):
            #    from src.data_loader import load_all_documents
            #    print("[INFO] Building FAISS index from documents...")
            #    docs = load_all_documents("data")
            #    self.vectorstore.build_from_documents(docs)
            #else:
            print("[INFO] Loading FAISS index from disk...")
            self.vectorstore.load()

        # --------------- CLASSIFIER SETUP ---------------
        print("[INFO] Loading local embedding classifier model (for semantic agri check)...")
        self.classifier_model = SentenceTransformer(embedding_classifier_name)

        # Cache for classification results
        self.class_cache = {}

        # Similarity thresholds (tunable)
        self.high_threshold = 0.40
        self.low_threshold = 0.28

        # Quick keyword list for instant positives
        self.quick_positive_keywords = [
            "crop", "soil", "fertilizer", "pest", "disease", "harvest", "irrigation", "yield",
            "plant", "seed", "farm", "farming", "livestock", "manure", "mulch", "greenhouse",
            "weather", "rainfall", "organic", "ph", "nitrogen", "phosphorus", "potassium"
        ]

    # -----------------------------------------------------
    # Agriculture Detection Methods
    # -----------------------------------------------------
    def _quick_keyword_check(self, query: str) -> bool:
        q = query.lower()
        return any(kw in q for kw in self.quick_positive_keywords)

    def _embedding_similarity_check(self, query: str) -> float:
        """
        Compute cosine similarity between query and agriculture reference topics.
        """
        q_emb = self.classifier_model.encode(query, convert_to_tensor=True)
        ref_embs = self.classifier_model.encode(AGRI_REFERENCE_TEXTS, convert_to_tensor=True)
        scores = util.cos_sim(q_emb, ref_embs)
        return float(scores.max().item())

    def _llm_classify_agriculture(self, query: str) -> bool:
        """
        Use LLM to classify whether query is agricultural.
        """
        prompt = (
            "You are a precise classifier. Decide if the following question is related to "
            "agriculture, crops, soil, farming, irrigation, fertilizers, or livestock.\n\n"
            f"Question: {query}\n\n"
            "Respond with only one word: YES or NO."
        )
        try:
            resp = self.llm.invoke([prompt])
            return resp.content.strip().upper() == "YES"
        except Exception as e:
            print(f"[WARN] LLM classifier failed: {e}")
            return True  # assume True to avoid false rejection

    def is_agriculture_query(self, query: str, chat_context: str = "") -> bool:
        """
        Hybrid agriculture detector with context awareness.
        Uses query + recent chat context for better classification.
        """
        q_key = query.lower().strip()
        combined_text = (chat_context + " " + q_key).lower()

        # ✅ If previous messages were about agriculture, continue that context
        if any(kw in combined_text for kw in self.quick_positive_keywords):
            self.class_cache[q_key] = True
            return True

        # ✅ If context itself contains agri content, assume this query continues it
        if any(kw in chat_context.lower() for kw in self.quick_positive_keywords):
            self.class_cache[q_key] = True
            return True

        # Check cache
        if q_key in self.class_cache:
            return self.class_cache[q_key]

        # Embedding similarity check using combined text
        max_sim = self._embedding_similarity_check(combined_text)
        if max_sim >= self.high_threshold:
            self.class_cache[q_key] = True
            return True
        if max_sim <= self.low_threshold:
            self.class_cache[q_key] = False
            return False

        # Ambiguous case → LLM classification fallback
        is_agri = self._llm_classify_agriculture(query)
        self.class_cache[q_key] = is_agri
        return is_agri

    # -----------------------------------------------------
    # Main RAG + Chat Memory Aware Answering
    # -----------------------------------------------------
    def search_and_summarize(self, query: str, top_k: int = 5, chat_context: str = "") -> str:
        """
        Full RAG pipeline with chat context awareness.
        If chat_context (previous conversation) is provided, it’s included in prompt.
        """

        print(f"[INFO] Received query: '{query}'")

        # STEP 1: Check if agriculture-related
        if not self.is_agriculture_query(query, chat_context=chat_context):
            return (
                "This assistant specializes in agricultural and farm-related topics only. "
                "Please ask questions about crops, soil, weather, fertilizers, or other farming-related subjects."
            )

        # STEP 2: FAISS Retrieval
        print("[INFO] Classified as agriculture query. Searching FAISS index...")
        start = time.time()
        results = self.vectorstore.query(query, top_k=top_k)
        print(f"[DEBUG] FAISS search took {time.time() - start:.2f}s, retrieved {len(results)} docs.")

        texts = [r.get("metadata", {}).get("text", "") for r in results if r.get("metadata")]
        texts = [t for t in texts if t.strip()]

        # STEP 3: RAG Mode (Data Found)
        if texts:
            chunk_summaries = []
            for i, chunk in enumerate(texts):
                sub_prompt = (
                    f"You are an agricultural summarizer.\n"
                    f"User Question: {query}\n\n"
                    f"Relevant Text Chunk:\n{chunk}\n\n"
                    "Summarize this chunk in 1–2 concise sentences focusing on relevant details."
                )
                try:
                    resp = self.llm.invoke([sub_prompt])
                    summary = resp.content.strip()
                    if summary:
                        chunk_summaries.append(summary)
                except Exception as e:
                    print(f"[WARN] Chunk summarization failed for chunk {i}: {e}")

            combined_summary = "\n".join(chunk_summaries)
            final_prompt = (
                "You are an expert agricultural assistant.\n"
                "Your job is to answer using ONLY the information from the conversation and retrieved context.\n"
                "Do NOT add any disclaimers such as checking other sources, websites, portals, or external updates.\n"
                "Do NOT refer the user to external information. Always give the final answer directly.\n"
                "If the user asks for detailed or long explanation, provide 4–6 sentences.\n"
                "Otherwise, ALWAYS give a short, precise answer of 1–2 sentences.\n\n"
                f"Conversation History:\n{chat_context}\n\n"
                f"Retrieved Context Summaries:\n{combined_summary}\n\n"
                f"User Question: {query}\n\n"
                "Now produce the final answer following the rules above:"
            )
            try:
                final_resp = self.llm.invoke([final_prompt])
                return final_resp.content.strip()
            except Exception as e:
                print(f"[ERROR] Final summarization failed: {e}")
                return "Error generating final summary from data."

        # STEP 4: General Knowledge Fallback
        print("[INFO] No relevant FAISS documents found. Using general agricultural knowledge.")
        fallback_prompt = (
            "You are an agricultural expert assistant. Use your own knowledge and previous conversation to answer.\n\n"
            f"Previous conversation:\n{chat_context}\n\n"
            f"User Question: {query}\n\n"
            "Answer helpfully in 3–5 sentences:"
        )
        try:
            fallback_resp = self.llm.invoke([fallback_prompt])
            return fallback_resp.content.strip()
        except Exception as e:
            print(f"[ERROR] General fallback failed: {e}")
            return "Sorry, I couldn’t generate an answer right now."
