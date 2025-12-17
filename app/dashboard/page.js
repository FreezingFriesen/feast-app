"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { db } from "../../utils/firebase.js"; 
import { collection, query, where, getDocs } from "firebase/firestore";
import Link from "next/link"; 

export default function Dashboard() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [recipes, setRecipes] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // 1. PROTECT THE ROUTE
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // 2. FETCH RECIPES
  useEffect(() => {
    const fetchRecipes = async () => {
      if (!user) return;

      try {
        const q = query(
          collection(db, "recipes"), 
          where("userId", "==", user.uid)
        );
        
        const querySnapshot = await getDocs(q);
        
        const recipesData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setRecipes(recipesData);
      } catch (error) {
        console.error("Error fetching recipes:", error);
      } finally {
        setLoadingData(false);
      }
    };

    fetchRecipes();
  }, [user]);

  // Handle Sign Out
  const handleLogout = async () => {
    try {
      await logout();
      router.push("/login");
    } catch (error) {
      console.error("Failed to log out", error);
    }
  };

  // --- LOADING STATE ---
  if (authLoading || loadingData) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 flex flex-col items-center animate-pulse">
            <svg className="w-10 h-10 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
            <p>Loading your kitchen...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* --- HEADER --- */}
        <header className="flex flex-col md:flex-row items-center justify-between mb-10 border-b border-slate-800 pb-6 gap-4">
          <div>
             <h1 className="text-3xl font-bold text-white tracking-tight">My Cookbook</h1>
             <p className="text-slate-500 text-sm mt-1">Manage and view your saved recipes</p>
          </div>
          
          <div className="flex items-center gap-4">
            <Link href="/recipe/newRecipe">
              <button className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 transition shadow-lg hover:shadow-blue-900/20 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                New Recipe
              </button>
            </Link>

            <button
              onClick={handleLogout}
              className="px-5 py-2.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800 transition font-medium"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* --- RECIPES GRID --- */}
        {recipes.length === 0 ? (
          // Empty State
          <div className="flex flex-col items-center justify-center mt-20 p-10 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/50">
            <div className="bg-slate-800 p-4 rounded-full mb-4">
                <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No recipes yet</h3>
            <p className="text-slate-500 mb-6 text-center">Your kitchen is looking a little empty.<br/>Create your first recipe to get started!</p>
            <Link href="/recipe/newRecipe">
                <button className="text-blue-400 hover:text-blue-300 font-medium">Create Recipe →</button>
            </Link>
          </div>
        ) : (
          // Grid State
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {recipes.map((recipe) => (
              <article 
                key={recipe.id} 
                className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-600 hover:shadow-xl transition group flex flex-col h-full"
              >
                {/* Image Area */}
                <div className="h-48 overflow-hidden bg-slate-800 relative">
                  {recipe.imageUrl ? (
                    <img
                      src={recipe.imageUrl}
                      alt={recipe.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-600">
                        <svg className="w-12 h-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    </div>
                  )}
                </div>

                {/* Content Area */}
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-white mb-2 line-clamp-1 group-hover:text-blue-400 transition">
                        {recipe.title}
                    </h3>
                    <div className="flex items-center gap-4 text-xs text-slate-400 mb-4 font-mono">
                        <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            {recipe.prepTime}m
                        </span>
                        <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                            {recipe.servings} ppl
                        </span>
                    </div>
                  </div>

                  <Link href={`/recipe/${recipe.id}`} className="block mt-4">
                    <button className="w-full py-2 rounded-lg bg-slate-800 text-slate-300 text-sm font-medium hover:bg-blue-600 hover:text-white transition">
                      View Recipe
                    </button>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}