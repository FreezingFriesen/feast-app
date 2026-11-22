import { cleanText, normaliseName } from "../clean";

describe("normaliseName", () => {
  it.each([
    ["Flour", "flour"],
    ["  Brown   Sugar ", "brown sugar"],
    ["Crème fraîche", "crème fraîche"],
    ["Crème fraîche", "crème fraîche"], // decomposed accents become composed (NFC)
    ["Sal​t", "salt"], // zero-width space removed
    ["Milk‮", "milk"], // direction override removed
    ["Egg\tyolk\n", "egg yolk"],
    ["Eggs", "eggs"], // no plural guessing
  ])("%p -> %p", (name, expected) => {
    expect(normaliseName(name)).toBe(expected);
  });

  it("its fast path for plain ASCII gives exactly what cleaning in full gives", () => {
    const full = (name: string) => cleanText(name).toLowerCase().replace(/\s+/g, " ");
    const samples = ["", " ", "  a  b  ", "Peanut Butter", "A&W (root) beer, 1/2 - 100%!", "~`{}|\\^", "x".repeat(200)];
    // Every printable ASCII character, alone and between spaces.
    for (let code = 0x20; code <= 0x7e; code += 1) {
      samples.push(String.fromCharCode(code), ` ${String.fromCharCode(code)}  A `);
    }
    for (const sample of samples) expect(normaliseName(sample)).toBe(full(sample));
  });
});
