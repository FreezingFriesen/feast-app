import { describeIngredientRepositoryContract } from "@/testing/contracts/ingredientRepositoryContract";
import { createInMemoryIngredientRepository } from "../inMemoryIngredientRepository";

describeIngredientRepositoryContract("in-memory", async () => createInMemoryIngredientRepository());
