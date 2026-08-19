import { Sequelize } from 'sequelize';
import InteractiveButton from './models/InteractiveButton.js';
import Product from './models/Product.js';

async function run() {
    const btns = await InteractiveButton.findAll({
        where: { label: { [Sequelize.Op.like]: '%صور المنتجات%' } }
    });
    for (const btn of btns) {
        console.log('Found button:', btn.label, 'ProductId:', btn.ProductId);
        if (btn.ProductId) {
            const prod = await Product.findByPk(btn.ProductId);
            console.log('Product images:', JSON.stringify(prod.images, null, 2));
        }
    }
    process.exit(0);
}
run();
