const fs = require('fs');
const path = require('path');

// تقدر تحدد مسار مخصص لمجلد الحفظ عن طريق متغير DATA_DIR (مفيد لو Volume الاستضافة
// مربوط بمسار مختلف). لو ما حددت شي، يستخدم مجلد data/ جوا المشروع افتراضيًا.
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

class PersistentMap extends Map {
  constructor(fileName, entries) {
    super(entries);
    this.filePath = path.join(dataDir, fileName);
  }

  static load(fileName) {
    const filePath = path.join(dataDir, fileName);
    let entries = [];
    if (fs.existsSync(filePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        entries = raw;
      } catch (e) {
        console.error(`__تعذر قراءة ملف الحفظ__ ${fileName}:`, e);
      }
    }
    return new PersistentMap(fileName, entries);
  }

  _save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify([...this.entries()], null, 2), 'utf8');
    } catch (e) {
      console.error(`__تعذر حفظ الملف__ ${this.filePath}:`, e);
    }
  }

  set(key, value) {
    super.set(key, value);
    this._save();
    return this;
  }

  delete(key) {
    const result = super.delete(key);
    this._save();
    return result;
  }
}

module.exports = PersistentMap;
module.exports.DATA_DIR_PATH = dataDir;
