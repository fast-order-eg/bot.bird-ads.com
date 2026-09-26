import { simulateChat } from './controllers/botController.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runTest() {
    console.log("=========================================");
    console.log("--- TEST 1: السلام عليكم ---");
    const r1 = await simulateChat(23, "السلام عليكم");
    console.log(r1);

    await sleep(2000);
    console.log("=========================================");
    console.log("--- TEST 2: طيران ---");
    const r2 = await simulateChat(23, "طيران");
    console.log(r2);

    await sleep(2000);
    console.log("=========================================");
    console.log("--- TEST 3: 15 يوم تقسيط ---");
    const r3 = await simulateChat(23, "حابب برنامج 15 يوم، نظام التقسيط ايه؟");
    console.log(r3);

    await sleep(2000);
    console.log("=========================================");
    console.log("--- TEST 4: بدون مقدم ---");
    const r4 = await simulateChat(23, "طيب الصور الموجودة تقسيط بمقدم، هل متاح بدون مقدم؟");
    console.log(r4);

    await sleep(2000);
    console.log("=========================================");
    console.log("--- TEST 5: تأكيد الشروط ---");
    const r5 = await simulateChat(23, "تمام الشروط متوفرة معايا");
    console.log(r5);

    process.exit(0);
}

runTest().catch(console.error);
