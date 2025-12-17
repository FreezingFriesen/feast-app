"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db, storage } from "../../../utils/firebase.js";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export default function NewRecipe() {
  const { user } = useAuth();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);

  // 1. SETUP FORM
  const { register, control, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      title: "",
      servings: 4,
      prepTime: 15,
      cookTime: 30,
      ingredients: [{ item: "", quantity: 1, unit: "cup" }],
      instructions: [{ step: "" }]
    }
  });

  // 2. DYNAMIC FIELDS
  const { fields: ingredientFields, append: appendIngredient, remove: removeIngredient } = useFieldArray({
    control,
    name: "ingredients"
  });

  const { fields: instructionFields, append: appendInstruction, remove: removeInstruction } = useFieldArray({
    control,
    name: "instructions"
  });

  // 3. SUBMIT HANDLER
  const onSubmit = async (data) => {
    if (!user) return alert("You must be logged in");
    setUploading(true);

    try {
      let imageUrl = "";

      if (data.image && data.image[0]) {
        const file = data.image[0];
        const storageRef = ref(storage, `recipes/${user.uid}/${Date.now()}-${file.name}`);
        try {
          const snapshot = await uploadBytes(storageRef, file);
          imageUrl = await getDownloadURL(snapshot.ref);
        } catch (storageError) {
          console.error("Storage upload error:", storageError);
          throw storageError;
        }
      }

      const keywords = data.title.toLowerCase().split(" ");

      // Normalize numeric fields so Firestore stores numbers, not strings.
      const payload = {
        ...data,
        servings: Number(data.servings) || 4,
        prepTime: Number(data.prepTime) || 0,
        cookTime: Number(data.cookTime) || 0,
        ingredients: (data.ingredients || []).map((ing) => ({
          ...ing,
          quantity: Number(ing.quantity) || 0,
        })),
        instructions: data.instructions || [],
        image: null,
        imageUrl: imageUrl,
        userId: user.uid,
        createdAt: serverTimestamp(),
        keywords: keywords,
      };

      let docRef;
      try {
        docRef = await addDoc(collection(db, "recipes"), payload);
      } catch (firestoreError) {
        console.error("Firestore write error:", firestoreError);
        throw firestoreError;
      }

      // Helpful debug output: log the saved document id so you can confirm
      // the save succeeded in the browser console when testing.
      console.log("Saved recipe id:", docRef.id);

      // show a brief saved state before navigating so the user sees confirmation
      setSaved(true);
      setUploading(false);
      setTimeout(() => {
        // reset saved so the button becomes clickable again if navigation fails
        setSaved(false);
        router.push("/dashboard");
      }, 900);
    } catch (error) {
      console.error("Error creating recipe:", error);
      alert("Error saving recipe. Check console.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* HEADER */}
        <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-bold text-white tracking-tight">Create New Recipe</h1>
          <button 
            type="button" 
            onClick={() => router.push('/dashboard')}
            className="text-white hover:text-white transition"
          >
            Return to Dashboard
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="lg:grid lg:grid-cols-3 lg:gap-10 space-y-8 lg:space-y-0">
          
          {/* --- LEFT COLUMN: META INFO --- */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Title & Basics Card */}
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-sm">
              <div className="mb-6">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Recipe Title</label>
                <input 
                  {...register("title", { required: true })} 
                  placeholder="e.g. Midnight Pasta"
                  className="w-full bg-slate-800 text-white p-3 rounded-lg border border-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition placeholder-slate-600"
                />
                {errors.title && <span className="text-red-400 text-sm mt-1 block">Required</span>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Prep (m)</label>
                  <input 
                    type="number" 
                    {...register("prepTime")} 
                    className="w-full bg-slate-800 text-white p-2 rounded-lg border border-slate-700 focus:ring-blue-500 outline-none" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Cook (m)</label>
                  <input 
                    type="number" 
                    {...register("cookTime")} 
                    className="w-full bg-slate-800 text-white p-2 rounded-lg border border-slate-700 focus:ring-blue-500 outline-none" 
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Servings</label>
                  <input 
                    type="number" 
                    {...register("servings")} 
                    className="w-full bg-slate-800 text-white p-2 rounded-lg border border-slate-700 focus:ring-blue-500 outline-none" 
                  />
                </div>
              </div>
            </div>

            {/* Image Upload Card */}
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-sm">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Cover Image</label>
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-700 rounded-lg cursor-pointer hover:bg-slate-800 hover:border-slate-500 transition group">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <svg className="w-8 h-8 mb-3 text-slate-500 group-hover:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                  <p className="text-xs text-slate-500 group-hover:text-slate-300">Click to upload</p>
                </div>
                <input type="file" accept="image/*" {...register("image")} className="hidden" />
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={uploading}
              className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition transform hover:scale-[1.02] active:scale-[0.98]
                ${uploading
                  ? "bg-slate-700 cursor-not-allowed text-slate-400"
                  : saved
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : "bg-blue-600 hover:bg-blue-500"
                }`}
            >
              {uploading ? "Saving..." : saved ? "Saved!" : "Save Recipe"}
            </button>
          </div>


          {/* --- RIGHT COLUMN: DETAILS --- */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Ingredients Section */}
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-sm">
              <div className="flex justify-between items-end mb-6">
                <h3 className="text-xl font-semibold text-slate-400">Ingredients</h3>
                <button 
                  type="button" 
                  onClick={() => appendIngredient({ item: "", quantity: 1, unit: "item" })}
                  className="text-sm text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                >
                  + Add Row
                </button>
              </div>
              
              <div className="space-y-3">
                {ingredientFields.map((field, index) => (
                  <div key={field.id} className="flex gap-3 group">
                    <input 
                      {...register(`ingredients.${index}.quantity`)} 
                      placeholder="1" 
                      type="number" 
                      step="0.1" 
                      className="w-20 bg-slate-800 text-white text-center p-3 rounded-lg border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none placeholder-slate-600"
                    />
                    <select 
                      {...register(`ingredients.${index}.unit`)} 
                      className="w-28 bg-slate-800 text-white p-3 rounded-lg border border-slate-700 focus:border-blue-500 outline-none appearance-none cursor-pointer"
                    >
                      <option value="item">item</option>
                      <option value="cup">cup</option>
                      <option value="tbsp">tbsp</option>
                      <option value="tsp">tsp</option>
                      <option value="g">g</option>
                      <option value="oz">oz</option>
                      <option value="lb">lb</option>
                      <option value="ml">ml</option>
                    </select>
                    <input 
                      {...register(`ingredients.${index}.item`, { required: true })} 
                      placeholder="Ingredient Name" 
                      className="flex-1 bg-slate-800 text-white p-3 rounded-lg border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none placeholder-slate-600" 
                    />
                    <button 
                      type="button" 
                      onClick={() => removeIngredient(index)} 
                      className="p-3 text-slate-600 hover:text-red-400 hover:bg-slate-800 rounded-lg transition opacity-0 group-hover:opacity-100"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Instructions Section */}
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-sm">
              <div className="flex justify-between items-end mb-6">
                <h3 className="text-xl font-semibold text-slate-400">Instructions</h3>
                <button 
                  type="button" 
                  onClick={() => appendInstruction({ step: "" })}
                  className="text-sm text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                >
                   + Add Step
                </button>
              </div>

              <div className="space-y-4">
                {instructionFields.map((field, index) => (
                  <div key={field.id} className="flex gap-4 items-start group">
                    <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-slate-800 text-slate-400 rounded-full font-mono text-sm border border-slate-700 mt-1">
                      {index + 1}
                    </span>
                    <textarea 
                      {...register(`instructions.${index}.step`, { required: true })} 
                      placeholder="Describe this step..."
                      className="flex-1 bg-slate-800 text-white p-4 rounded-lg border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none min-h-[100px] placeholder-slate-600 leading-relaxed resize-none" 
                    />
                    <button 
                      type="button" 
                      onClick={() => removeInstruction(index)} 
                      className="mt-2 text-slate-600 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </form>
      </div>
    </div>
  );
}