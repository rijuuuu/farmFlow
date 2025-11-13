import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "../style/Login.css";

export default function SignUp() {
  const [formData, setFormData] = useState({
    uniqueID: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    const { uniqueID, email, password } = formData;

    if (!uniqueID || !email || !password) {
      setError("Please fill in all fields");
      setLoading(false);
      return;
    }

    setError("");

    try {
      const response = await fetch("http://127.0.0.1:5000/signUp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error("Invalid JSON response from server");
      }

      console.log("Server response:", result);

      if (response.ok) {
        localStorage.setItem("uniqueID", uniqueID);
        navigate("/Login");
      } else {
        setError(result.error || "Signup failed");
      }
    } catch (err) {
      console.error(err);
      setError("Server error. Please try again.");
    }

    setLoading(false);
  };

  return (
    <div className="loginPage">
      <h1 className="login-title">Sign Up</h1>
      <form className="login-form" onSubmit={handleSubmit}>
        <div>
          <input
            type="text"
            name="uniqueID"
            className="form-input"
            value={formData.uniqueID}
            onChange={handleChange}
            placeholder="Unique ID"
          />
        </div>

        <div>
          <input
            type="email"
            name="email"
            className="form-input"
            value={formData.email}
            onChange={handleChange}
            placeholder="Email"
          />
        </div>

        <div>
          <input
            type="password"
            name="password"
            className="form-input"
            value={formData.password}
            onChange={handleChange}
            placeholder="Password"
          />
        </div>

        {error && <p className="error-message">{error}</p>}

        <button type="submit" className="login-button" disabled={loading}>
          {loading ? "Signing Up..." : "Sign Up"}
        </button>
      </form>

      <p className="signup-text">
        Already have an account?{" "}
        <Link to="/Login" className="signup-link">
          Login
        </Link>
      </p>
    </div>
  );
}
