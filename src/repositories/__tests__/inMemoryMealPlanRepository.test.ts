import { describeMealPlanRepositoryContract } from "@/testing/contracts/mealPlanRepositoryContract";
import { createInMemoryMealPlanRepository } from "../inMemoryMealPlanRepository";

describeMealPlanRepositoryContract("in-memory", async (now) => createInMemoryMealPlanRepository(now));
