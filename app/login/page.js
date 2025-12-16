"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation"; 
import { useEffect, useState } from "react";

export default function LoginPage() {
  const { user, signInWithGoogle, signInWithGithub } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (user) {
      router.push("/dashboard");
    }
  }, [user, router]);

  // Handle login with Google
  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
      // The useEffect above will handle the redirect
    } catch (err) {
      setError("Failed to login with Google.");
      console.error(err);
    }
  };

  // Handle login with GitHub
  const handleGithubLogin = async () => {
    try {
      await signInWithGithub();
    } catch (err) {
      setError("Failed to login with GitHub.");
      console.error(err);
    }
  };

  // Render login buttons
  return (
    <div style={{ maxWidth: "400px", margin: "50px auto", textAlign: "center" }}>
      <h1>Welcome to Recipe Manager</h1>
      <p>Please sign in to continue</p>
      
      {error && <p style={{ color: "red" }}>{error}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <button 
          onClick={handleGoogleLogin}
          style={{ padding: "10px", cursor: "pointer" }}
        >
          Sign in with Google
        </button>
        
        <button 
          onClick={handleGithubLogin}
          style={{ padding: "10px", cursor: "pointer" }}
        >
          Sign in with GitHub
        </button>
      </div>
    </div>
  );
}