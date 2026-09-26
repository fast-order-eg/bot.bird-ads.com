import { simulateChat } from './controllers/botController.js';

async function runTest() {
    console.log("--- TEST 1: السلام عليكم ---");
    const r1 = await simulateChat(23, "السلام عليكم");
    console.log("Reply 1:\n", r1.reply);
    console.log("Products 1:", r1.show_products);

    console.log("\n--- TEST 2: طيران ---");
    const r2 = await simulateChat(23, "طيران");
    console.log("Reply 2:\n", r2.reply);
    console.log("Products 2:", r2.show_products);

    console.log("\n--- TEST 3: 15 يوم تقسيط ---");
    const r3 = await simulateChat(23, "حابب 15 يوم، نظام التقسيط ايه؟");
    console.log("Reply 3:\n", r3.reply);
    console.log("Products 3:", r3.show_products);

    console.log("\n--- TEST 4: بدون مقدم ---");
    const r4 = await simulateChat(23, "طيب الصور الموجودة تقسيط بمقدم، هل متاح بدون مقدم؟");
    console.log("Reply 4:\n", r4.reply);
    console.log("Products 4:", r4.show_products);

    process.exit(0);
}

runTest().catch(console.error);
