import { describeRecipeRepositoryContract } from "@/testing/contracts/recipeRepositoryContract";
import { createInMemoryRecipeRepository } from "../inMemoryRecipeRepository";

describeRecipeRepositoryContract("in-memory", async (now) => createInMemoryRecipeRepository(now));
