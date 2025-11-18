import re
import pandas as pd
import numpy as np
from collections import Counter
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(os.getcwd(), "new_allschemes.csv")

df = pd.read_csv(CSV_PATH)

text_cols = ["scheme_name", "state_ministry", "description", "tags", "combined_text"]
for c in text_cols:
    df[c] = df[c].fillna("").astype(str)


all_tags = ", ".join(df["tags"].fillna(""))
tag_list = [t.strip().lower() for t in all_tags.split(",") if t.strip()]
tag_counts = Counter(tag_list)
important_keywords = [tag for tag, _ in tag_counts.most_common(50)]

vectorizer = TfidfVectorizer(stop_words="english")
tfidf_matrix = vectorizer.fit_transform(df["combined_text"])

def word_in(text, word):
    pattern = r"\b" + re.escape(word.lower()) + r"\b"
    return re.search(pattern, text.lower()) is not None

def recommend_scheme_single(crop: str, state: str):
    """
    Returns:
        {
            "scheme_name": ...,
            "state_ministry": ...,
            "score": ...,
            "description": ...,
            "tags": ...
        }
    """
    crop = crop.lower().strip()
    state = state.lower().strip()

    # ML similarity raw scores
    user_query = f"{crop} farmer in {state} looking for schemes"
    qvec = vectorizer.transform([user_query])
    ml_raw = cosine_similarity(qvec, tfidf_matrix).flatten()

    final_scores = []

    for idx, row in df.iterrows():
        desc = row["description"].lower()
        tags = row["tags"].lower()
        sm = row["state_ministry"].lower()
        name = row["scheme_name"].lower()

        score = 0.0

        # STATE SCORING
        if state in sm:
            score += 10000
        elif "ministry of" in sm or "government of india" in sm:
            score += 3000
        else:
            score -= 8000

        # CROP SCORING
        if word_in(name, crop):
            score += 500
        if word_in(tags, crop):
            score += 300
        if word_in(desc, crop):
            score += 150

        # KEYWORD BOOST
        for key in important_keywords:
            if word_in(tags, key) or word_in(desc, key):
                score += 5

        # ML SCORE
        score += ml_raw[idx] * 100

        final_scores.append(score)

    final_scores = np.array(final_scores)
    best_index = final_scores.argmax()
    best_row = df.iloc[best_index]

    return {
        "scheme_name": best_row["scheme_name"],
        "state_ministry": best_row["state_ministry"],
        "description": best_row["description"],
        "tags": best_row["tags"],
        "scheme_link": str(best_row["scheme_link"]) if "scheme_link" in df.columns else "",
        "score": float(final_scores[best_index])
    }
