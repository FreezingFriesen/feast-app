"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext"; // Optional: if you want to check ownership later
import { db } from "../../../utils/firebase.js"; 
import { doc, getDoc } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function RecipeDetail() {
  const { id } = useParams(); 
  const router = useRouter();
  const { user } = useAuth();

  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // STATE: Controls the dynamic serving size (defaults to 4 until data loads)
  const [currentServings, setCurrentServings] = useState(4);

  // 1. FETCH DATA
  useEffect(() => {
    const fetchRecipe = async () => {
      try {
        const docRef = doc(db, "recipes", id);
        const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setRecipe(data);
                    // Initialize scaler with the saved baseline. Coerce to number in case
                    // the stored value is a string to avoid unexpected concatenation.
                    setCurrentServings(Number(data.servings) || 4);
        } else {
          console.log("No such recipe!");
        }
      } catch (error) {
        console.error("Error fetching recipe:", error);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchRecipe();
  }, [id]);

  // 2. SCALING LOGIC (The Core Feature)
  const scaledIngredients = useMemo(() => {
    if (!recipe) return [];
    
    // Prevent division by zero if recipe.servings is missing
    const originalServings = recipe.servings || 1; 
    const multiplier = currentServings / originalServings;

    return recipe.ingredients.map(ing => ({
      ...ing,
      // Calculate: (Original Qty * Multiplier)
      // parseFloat ensures we treat it as a number, not a string
      scaledQuantity: (parseFloat(ing.quantity) * multiplier)
    }));
  }, [recipe, currentServings]);

  // --- LOADING STATE ---
  if (loading) {
    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="text-slate-400 animate-pulse">Loading recipe...</div>
        </div>
    );
  }

  if (!recipe) {
    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
            <h2 className="text-xl text-white mb-2">Recipe not found</h2>
            <button onClick={() => router.push('/dashboard')} className="text-blue-500 hover:underline">Return to Dashboard</button>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        
          {/* --- BACK BUTTON --- */}
          <Link href="/dashboard" className="inline-flex items-center text-slate-400 hover:text-white transition mb-8 group">
             <svg className="w-4 h-4 mr-2 transform group-hover:-translate-x-1 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
             Back to Cookbook
          </Link>

          {/* --- HEADER SECTION --- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-12">
              
              {/* Left: Image */}
              <div className="rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl h-80 lg:h-96 relative">
                  {recipe.imageUrl ? (
                      <img 
                          src={recipe.imageUrl} 
                          alt={recipe.title} 
                          className="w-full h-full object-cover"
                      />
                  ) : (
                      <div className="flex flex-col items-center justify-center h-full text-slate-600">
                          <svg className="w-16 h-16 opacity-20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                          <span className="opacity-50">No Image Uploaded</span>
                      </div>
                  )}
              </div>

              {/* Right: Title & Scaling Control */}
              <div className="flex flex-col justify-center">
                  <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">{recipe.title}</h1>
                  
                  <div className="flex gap-4 mb-8">
                      <span className="bg-slate-900 border border-slate-700 text-blue-400 px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                          Prep: {recipe.prepTime}m
                      </span>
                      <span className="bg-slate-900 border border-slate-700 text-green-400 px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                          Cook: {recipe.cookTime}m
                      </span>
                  </div>

                  {/* --- DYNAMIC SCALER WIDGET --- */}
                  <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-lg">
                      <div className="flex justify-between items-center mb-4">
                          <label className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Serving Size</label>
                          <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">
                              Original Recipe: {recipe.servings}
                          </span>
                      </div>
                      
                      <div className="flex items-center gap-6">
                          <button 
                              onClick={() => setCurrentServings(prev => Math.max(1, prev - 1))}
                              className="w-12 h-12 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 hover:border-slate-500 hover:text-white transition text-xl font-bold"
                          >
                              −
                          </button>
                          
                          <div className="text-center">
                              <span className="block text-4xl font-bold text-white">{currentServings}</span>
                              <span className="text-xs text-slate-500 uppercase">People</span>
                          </div>

                          <button 
                              onClick={() => setCurrentServings(prev => prev + 1)}
                              className="w-12 h-12 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 hover:border-slate-500 hover:text-white transition text-xl font-bold"
                          >
                              +
                          </button>
                      </div>
                  </div>
              </div>
          </div>

          {/* --- CONTENT GRID --- */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              
              {/* Ingredients Column */}
              <div className="md:col-span-1">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 sticky top-8">
                      <h3 className="text-xl font-bold text-white mb-6 border-b border-slate-800 pb-4">Ingredients</h3>
                      <ul className="space-y-4">
                          {scaledIngredients.map((ing, index) => (
                              <li key={index} className="flex justify-between items-start text-sm md:text-base">
                                  <span className="text-slate-200 font-medium">
                                      {/* Handle formatting: show 1.5 instead of 1.500000 */}
                                      {parseFloat(ing.scaledQuantity.toFixed(2))} {ing.unit}
                                  </span>
                                  <span className="text-slate-400 text-right ml-4 flex-1">{ing.item}</span>
                              </li>
                          ))}
                      </ul>
                  </div>
              </div>

              {/* Instructions Column */}
              <div className="md:col-span-2">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 md:p-8">
                      <h3 className="text-xl font-bold text-white mb-6 border-b border-slate-800 pb-4">Instructions</h3>
                      <div className="space-y-8">
                          {recipe.instructions.map((inst, index) => (
                              <div key={index} className="flex gap-5 group">
                                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-slate-800 text-blue-400 border border-slate-700 rounded-full font-bold text-sm mt-1 group-hover:border-blue-500 group-hover:text-blue-300 transition">
                                      {index + 1}
                                  </div>
                                  <p className="text-slate-300 leading-relaxed pt-1 text-lg">
                                      {inst.step}
                                  </p>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>

          </div>

      </div>
    </div>
  );
}
