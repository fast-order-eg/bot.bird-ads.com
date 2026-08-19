// Mock Instructions
const mockInstructions = [
    { clientName: "Greeting", content: "Welcome message...", type: "global", keywords: "hello, hi" },
    { clientName: "Pricing", content: "Price list...", type: "topic", keywords: "price, cost, بكام, سعر" },
    { clientName: "Location", content: "We are in Cairo...", type: "topic", keywords: "location, address, عنوان, فين" }
];

function getFilteredInstructions(userText) {
    const normalizeText = (text) => text ? text.toLowerCase().trim() : "";
    const userQuery = normalizeText(userText);

    let loadedTopics = [];

    const filtered = mockInstructions.filter(inst => {
        if (inst.type === 'global') return true;

        if (inst.keywords) {
            const keywords = inst.keywords.split(',').map(k => normalizeText(k));
            const isRelevant = keywords.some(k => k.length > 2 && userQuery.includes(k));

            if (isRelevant) {
                loadedTopics.push(inst.clientName);
                return true;
            }
        }
        return false;
    });

    return { count: filtered.length, topics: loadedTopics };
}

console.log("🚀 Testing Bot Logic...");

// Test 1: Generic Greeting
const res1 = getFilteredInstructions("السلام عليكم");
console.log(`Test 1 (Generic): Loaded ${res1.count} (Topics: ${res1.topics.join(', ')}) - EXPECT: 1 (Global only)`);

// Test 2: Pricing Query
const res2 = getFilteredInstructions("بكام الاشتراك؟");
console.log(`Test 2 (Pricing): Loaded ${res2.count} (Topics: ${res2.topics.join(', ')}) - EXPECT: 2 (Global + Pricing)`);

// Test 3: Location Query
const res3 = getFilteredInstructions("عنوانكم فين؟");
console.log(`Test 3 (Location): Loaded ${res3.count} (Topics: ${res3.topics.join(', ')}) - EXPECT: 2 (Global + Location)`);
