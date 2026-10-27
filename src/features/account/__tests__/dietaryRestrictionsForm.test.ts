import { dietaryRestrictionsSchema } from "@/validation/profileSchema";
import {
  canSave,
  describeRestrictions,
  saveLabel,
  toDietaryFormValues,
  toggleChoice,
} from "../dietaryRestrictionsForm";

const none = { allergens: [], diets: [] };
const some = dietaryRestrictionsSchema.parse({ allergens: ["milk", "peanuts"], diets: ["vegan"] });

describe("dietary restrictions form (N-18)", () => {
  it("starts from the saved choices, or nothing when not set yet", () => {
    expect(toDietaryFormValues(null)).toEqual(none);
    expect(toDietaryFormValues(some)).toEqual({ allergens: ["peanuts", "milk"], diets: ["vegan"] });
  });

  it("toggles a chip on and off", () => {
    expect(toggleChoice(["milk"], "eggs")).toEqual(["milk", "eggs"]);
    expect(toggleChoice(["milk", "eggs"], "milk")).toEqual(["eggs"]);
  });

  it("can always save when nothing was saved yet, which records 'none'", () => {
    expect(canSave(null, toDietaryFormValues(null))).toBe(true);
    expect(saveLabel(null, toDietaryFormValues(null))).toBe("I don't have any");
    expect(saveLabel(null, { allergens: ["milk"], diets: [] })).toBe("Save");
  });

  it("only saves real changes once set, in any order", () => {
    expect(canSave(some, { allergens: ["milk", "peanuts"], diets: ["vegan"] })).toBe(false);
    expect(canSave(some, { allergens: ["milk"], diets: ["vegan"] })).toBe(true);
    expect(canSave(some, none)).toBe(true);
    expect(canSave(none, none)).toBe(false);
    expect(saveLabel(none, none)).toBe("Save");
  });

  it("describes 'not set yet', 'none' and the choices differently", () => {
    expect(describeRestrictions(null)).toBe("Not set yet");
    expect(describeRestrictions(none)).toBe("None");
    expect(describeRestrictions(some)).toBe("Peanuts, Milk, Vegan");
  });
});
