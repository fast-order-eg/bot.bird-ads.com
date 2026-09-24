import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import User from './User.js';

const Product = sequelize.define('Product', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'اسم المنتج أو الخدمة'
    },
    type: {
        type: DataTypes.ENUM('product', 'service'),
        allowNull: false,
        defaultValue: 'product',
        comment: 'نوع العنصر: منتج أو خدمة'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'وصف تفصيلي للمنتج أو الخدمة'
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: 'السعر',
        get() {
            const raw = this.getDataValue('price');
            if (raw === null || raw === undefined || raw === '') return null;
            const num = Math.round(parseFloat(raw));
            return isNaN(num) ? null : num;
        }
    },
    currency: {
        type: DataTypes.STRING(10),
        defaultValue: 'جنيه',
        comment: 'العملة',
        get() {
            const raw = this.getDataValue('currency');
            if (!raw || raw.toUpperCase() === 'EGP' || raw === 'ج.م') return 'جنيه';
            if (raw.toUpperCase() === 'SAR') return 'ريال';
            if (raw.toUpperCase() === 'AED') return 'درهم';
            if (raw.toUpperCase() === 'USD') return 'دولار';
            if (raw.toUpperCase() === 'EUR') return 'يورو';
            return raw;
        }
    },
    category: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'التصنيف (ملابس، أكل، خدمات تصميم، إلخ)'
    },
    images: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'JSON array: [{url, description, order}]',
        get() {
            const raw = this.getDataValue('images');
            if (!raw) return [];
            try {
                return JSON.parse(raw);
            } catch (e) {
                return [];
            }
        },
        set(val) {
            this.setDataValue('images', typeof val === 'string' ? val : JSON.stringify(val));
        }
    },
    status: {
        type: DataTypes.ENUM('available', 'out_of_stock'),
        defaultValue: 'available',
        comment: 'حالة المنتج: متاح أو نفد'
    },
    keywords: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'كلمات مفتاحية (AI Generated) للبحث والاستدعاء'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'تفعيل/تعطيل المنتج'
    }
}, {
    tableName: 'products'
});

// Relationships
User.hasMany(Product, { foreignKey: 'UserId', onDelete: 'CASCADE' });
Product.belongsTo(User, { foreignKey: 'UserId' });

export default Product;
