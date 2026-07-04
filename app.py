"""
Growexa AI - Flask backend
==========================
Serves the login page, the dashboard, and every /api/* endpoint that
static/script.js calls. Run this file directly (or via PyCharm's Run
button) and open http://127.0.0.1:5000 in your browser.

    pip install -r requirements.txt
    python app.py
"""

import csv
import io
import os
import random
from datetime import datetime, timedelta

from flask import Flask, render_template, request, jsonify, session

app = Flask(__name__)
app.secret_key = "growexa-dev-secret-change-me"  # only needed for session/flash use

# ---------------------------------------------------------------------------
# In-memory "database". Fine for a local demo — replace with a real DB/session
# store if you deploy this for multiple concurrent users.
# ---------------------------------------------------------------------------
STATE = {"customers": []}

REQUIRED_COLUMNS = [
    "Customer Name", "Email", "Mobile Number", "Total Spend",
    "Purchase Frequency", "Last Purchase Date", "Days Since Purchase",
    "Cart Abandoned", "Discount Used", "Product Category", "Customer City",
]

DEMO_CITIES = ["Mumbai", "Delhi", "Bengaluru", "Pune", "Raipur", "Chennai", "Hyderabad"]
DEMO_CATEGORIES = ["Electronics", "Fashion", "Grocery", "Home & Living", "Beauty", "Sports"]


def _truthy(value):
    return str(value).strip().lower() in ("yes", "true", "1", "y")


def _segment_for(customer):
    """Rule-based customer segmentation used across recommendations,
    segments, campaigns and analytics endpoints."""
    if customer["cart_abandoned"]:
        return "Cart Abandoner"
    if customer["days_since_purchase"] > 60:
        return "At Risk"
    if customer["discount_used"]:
        return "Price Sensitive"
    return "Loyal Customer"


def _recommendation_for(segment):
    return {
        "Loyal Customer":  ("No Discount", 0),
        "Price Sensitive": ("Offer Discount", 10),
        "Cart Abandoner":  ("Reminder Message", 5),
        "At Risk":         ("Re-engagement Offer", 15),
    }[segment]


def _demo_customers(n=24):
    """Generate deterministic-ish demo data so every section of the
    dashboard has something to show before any CSV is uploaded."""
    random.seed(42)
    names = [
        "Rahul Sharma", "Priya Mehta", "Aman Verma", "Neha Singh", "Kiran Patel",
        "Divya Rao", "Arjun Nair", "Sneha Joshi", "Vikram Das", "Pooja Iyer",
        "Rohit Gupta", "Anjali Kapoor", "Suresh Kumar", "Meera Pillai", "Karan Malhotra",
        "Ritu Chawla", "Sanjay Bhatt", "Isha Reddy", "Manish Yadav", "Tanvi Shah",
        "Ashok Menon", "Deepa Nambiar", "Varun Bhatia", "Lakshmi Iyer",
    ]
    customers = []
    for i, name in enumerate(names[:n]):
        cart_abandoned = random.random() < 0.22
        discount_used = random.random() < 0.4
        days_since = random.choice([2, 5, 9, 15, 22, 30, 45, 60, 75, 90])
        spend = random.randint(1500, 95000)
        freq = random.randint(1, 18)
        last_purchase = (datetime.now() - timedelta(days=days_since)).strftime("%Y-%m-%d")
        c = {
            "name": name,
            "email": name.lower().replace(" ", ".") + "@example.com",
            "mobile": f"+91 9{random.randint(100000000, 999999999)}",
            "total_spend": spend,
            "purchase_frequency": freq,
            "last_purchase_date": last_purchase,
            "days_since_purchase": days_since,
            "cart_abandoned": cart_abandoned,
            "discount_used": discount_used,
            "category": random.choice(DEMO_CATEGORIES),
            "city": random.choice(DEMO_CITIES),
        }
        customers.append(c)
    return customers


def get_customers():
    """Uploaded data always wins; fall back to demo data otherwise."""
    return STATE["customers"] if STATE["customers"] else _demo_customers()


# ---------------------------------------------------------------------------
# Shared KPI computation — used by BOTH /api/kpis (page load / section
# switch) and /api/upload (right after a CSV is processed). Keeping this
# in one place guarantees the Dashboard, Upload page, and Analytics page
# summary cards always show the exact same numbers.
# ---------------------------------------------------------------------------
def _compute_kpis(customers):
    active = len(customers)
    total_revenue = sum(c["total_spend"] for c in customers)
    discounted = sum(1 for c in customers if c["discount_used"])
    full_price = active - discounted
    average_spend = total_revenue / active if active else 0
    returning = sum(1 for c in customers if c["purchase_frequency"] > 1)
    cart_abandoned = sum(1 for c in customers if c["cart_abandoned"])

    highest = max(customers, key=lambda c: c["total_spend"]) if customers else None
    highest_spend = highest["total_spend"] if highest else 0
    highest_customer = highest["name"] if highest else "-"

    cat_totals = {}
    for c in customers:
        cat_totals[c["category"]] = cat_totals.get(c["category"], 0) + c["total_spend"]
    top_category = max(cat_totals, key=cat_totals.get) if cat_totals else "-"

    return {
        # Dashboard second KPI row + AI Profit Summary panel
        "revenue_this_month": total_revenue,
        "profit_generated": round(total_revenue * 0.30),
        "marketing_roi": 4.8,
        "active_customers": active,
        "retention_rate": round(100 * full_price / active, 1) if active else 0,
        "discount_savings": round(total_revenue * 0.12),
        "customers_analyzed": active,
        "discounts_avoided": full_price,
        "additional_profit": round(total_revenue * 0.15),
        "conversion_improvement": 65,

        # Dashboard top KPI row / Upload page cards / Analytics summary cards
        "customers": active,
        "total_revenue": total_revenue,
        "average_spend": average_spend,
        "highest_spend": highest_spend,
        "highest_customer": highest_customer,
        "returning_customers": returning,
        "cart_abandoned": cart_abandoned,
        "top_category": top_category,
    }


# ---------------------------------------------------------------------------
# Page routes
# ---------------------------------------------------------------------------
@app.route("/")
def login_page():
    return render_template("login.html")


@app.route("/dashboard")
def dashboard_page():
    return render_template("index.html")


# ---------------------------------------------------------------------------
# API: KPIs
# ---------------------------------------------------------------------------
@app.route("/api/kpis")
def api_kpis():
    return jsonify(_compute_kpis(get_customers()))


# ---------------------------------------------------------------------------
# API: CSV upload
# ---------------------------------------------------------------------------
@app.route("/api/upload", methods=["POST"])
def api_upload():
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file uploaded."})

    file = request.files["file"]
    if not file.filename.lower().endswith(".csv"):
        return jsonify({"success": False, "message": "Please upload a .csv file."})

    try:
        raw = file.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        return jsonify({"success": False, "message": "Could not read the file. Please save it as UTF-8 CSV."})

    reader = csv.DictReader(io.StringIO(raw))
    if not reader.fieldnames:
        return jsonify({"success": False, "message": "The CSV appears to be empty."})

    missing = [col for col in REQUIRED_COLUMNS if col not in reader.fieldnames]
    if missing:
        return jsonify({
            "success": False,
            "message": "Missing required columns: " + ", ".join(missing),
        })

    customers = []
    for row in reader:
        try:
            customers.append({
                "name": row["Customer Name"].strip(),
                "email": row["Email"].strip(),
                "mobile": row["Mobile Number"].strip(),
                "total_spend": float(row["Total Spend"] or 0),
                "purchase_frequency": int(float(row["Purchase Frequency"] or 0)),
                "last_purchase_date": row["Last Purchase Date"].strip(),
                "days_since_purchase": int(float(row["Days Since Purchase"] or 0)),
                "cart_abandoned": _truthy(row["Cart Abandoned"]),
                "discount_used": _truthy(row["Discount Used"]),
                "category": row["Product Category"].strip(),
                "city": row["Customer City"].strip(),
            })
        except (ValueError, KeyError):
            continue  # skip malformed rows

    if not customers:
        return jsonify({"success": False, "message": "No valid rows found in the CSV."})

    STATE["customers"] = customers

    return jsonify({
        "success": True,
        "customers": customers,
        "kpis": _compute_kpis(customers),
    })


# ---------------------------------------------------------------------------
# API: Recommendations
# ---------------------------------------------------------------------------
@app.route("/api/recommendations")
def api_recommendations():
    customers = get_customers()
    out = []
    for c in customers[:30]:
        segment = _segment_for(c)
        rec, discount = _recommendation_for(segment)
        out.append({
            "name": c["name"].split(" ")[0],
            "segment": segment,
            "recommendation": rec,
            "discount": discount,
        })
    return jsonify(out)


# ---------------------------------------------------------------------------
# API: Segments
# ---------------------------------------------------------------------------
@app.route("/api/segments")
def api_segments():
    customers = get_customers()
    counts = {"Loyal Customer": 0, "Price Sensitive": 0, "Cart Abandoner": 0, "At Risk": 0}
    for c in customers:
        counts[_segment_for(c)] += 1
    return jsonify(counts)


# ---------------------------------------------------------------------------
# API: Campaign suggestion
# ---------------------------------------------------------------------------
@app.route("/api/campaign/suggest")
def api_campaign_suggest():
    customers = get_customers()
    abandoners = [c for c in customers if _segment_for(c) == "Cart Abandoner"]
    target = "Cart Abandoners" if abandoners else "Price Sensitive"
    audience = len(abandoners) if abandoners else sum(1 for c in customers if _segment_for(c) == "Price Sensitive")

    return jsonify({
        "target_segment": target,
        "audience_size": audience,
        "channel": "WhatsApp",
        "discount": 10,
        "best_time": "7:00 PM",
        "expected_conversion": "+65%",
    })


# ---------------------------------------------------------------------------
# API: Analytics
# ---------------------------------------------------------------------------
@app.route("/api/analytics")
def api_analytics():
    customers = get_customers()[:20]  # cap so charts stay readable

    categories, cities = {}, {}
    for c in customers:
        categories[c["category"]] = categories.get(c["category"], 0) + c["total_spend"]
        cities[c["city"]] = cities.get(c["city"], 0) + 1

    discount_used = {
        "Yes": sum(1 for c in customers if c["discount_used"]),
        "No": sum(1 for c in customers if not c["discount_used"]),
    }
    cart_abandoned = {
        "Yes": sum(1 for c in customers if c["cart_abandoned"]),
        "No": sum(1 for c in customers if not c["cart_abandoned"]),
    }
    segments = {"Loyal Customer": 0, "Price Sensitive": 0, "Cart Abandoner": 0, "At Risk": 0}
    for c in customers:
        segments[_segment_for(c)] += 1

    return jsonify({
        "customer_names": [c["name"] for c in customers],
        "spending": [c["total_spend"] for c in customers],
        "purchase_frequency": [c["purchase_frequency"] for c in customers],
        "days_since_purchase": [c["days_since_purchase"] for c in customers],
        "categories": categories,
        "cities": cities,
        "discount_used": discount_used,
        "cart_abandoned": cart_abandoned,
        "segments": segments,
    })


# ---------------------------------------------------------------------------
# API: Chat assistant (simple rule-based responder)
# ---------------------------------------------------------------------------
@app.route("/api/chat", methods=["POST"])
def api_chat():
    message = (request.json or {}).get("message", "").lower()
    customers = get_customers()

    def names_in(segment, limit=5):
        matches = [c["name"] for c in customers if _segment_for(c) == segment]
        return ", ".join(matches[:limit]) if matches else "none right now"

    if "target" in message or "today" in message:
        reply = f"Focus on Cart Abandoners and At-Risk customers today: {names_in('Cart Abandoner')} " \
                f"and {names_in('At Risk')}."
    elif "profit" in message or "save" in message or "saved" in message:
        total_revenue = sum(c["total_spend"] for c in customers)
        reply = f"Personalized targeting generated roughly ₹{round(total_revenue*0.15):,} in additional " \
                f"profit this month versus flat 20% discounting."
    elif "loyal" in message:
        reply = f"Your loyal customers include: {names_in('Loyal Customer')}."
    elif "risk" in message:
        reply = f"Customers currently at risk of churning: {names_in('At Risk')}."
    elif "cart" in message or "abandon" in message:
        reply = f"Cart abandoners to re-target: {names_in('Cart Abandoner')}."
    elif "segment" in message:
        reply = "Growexa tracks four segments: Loyal Customers, Price Sensitive, Cart Abandoners, and At Risk."
    else:
        reply = "I can help with targeting, profit summaries, or segment breakdowns — try asking " \
                "'Who are my loyal customers?' or 'Which customers should I target today?'"

    return jsonify({"reply": reply})


# ---------------------------------------------------------------------------
# Sample CSV (generated once on first request, served as a static file)
# ---------------------------------------------------------------------------
def _ensure_sample_csv():
    path = os.path.join(app.static_folder, "sample_customer_data.csv")
    if os.path.exists(path):
        return
    rows = _demo_customers(15)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(REQUIRED_COLUMNS)
        for c in rows:
            writer.writerow([
                c["name"], c["email"], c["mobile"], c["total_spend"],
                c["purchase_frequency"], c["last_purchase_date"], c["days_since_purchase"],
                "Yes" if c["cart_abandoned"] else "No",
                "Yes" if c["discount_used"] else "No",
                c["category"], c["city"],
            ])


if __name__ == "__main__":
    _ensure_sample_csv()
    app.run(debug=True, host="127.0.0.1", port=5000)
