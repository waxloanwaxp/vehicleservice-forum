# VehicleService Forum

เว็บฟอรัมประกาศบริการยานพาหนะ - แพลตฟอร์มเชื่อมโยงผู้หาบริการกับผู้ให้บริการ

## ✨ ฟีเจอร์หลัก

### 👥 ระบบสมาชิก 2 ประเภท
- **ผู้ใช้ทั่วไป (Seeker)**: โพสต์หาบริการ, อัปโหลดรูป, รับใบเสนอราคา, ยืนยันราคา
- **ผู้ให้บริการ (Provider)**: 瀏覽服務, เสนอราคาใต้กระทู้, จัดการใบเสนอราคา

### 📝 ระบบกระทู้
- สร้างกระทู้พร้อมรูปภาพ (สูงสุด 5 รูป, ไฟล์ละ 5MB)
- รองรับ Markdown ในรายละเอียด
- ข้อมูลยานพาหนะ: ประเภท, ยี่ห้อ, ปี, ไมล์, ทะเบียน
- งบประมาณขั้นต่ำ/สูงสุด
- ความเร่งด่วน: ปกติ / ด่วน / ฉุกเฉิน

### 💰 ระบบเสนอราคา (Bidding)
- เสนอราคา + ข้อความ + ระยะเวลาประมาณการ
- แสดงชื่อผู้เสนอ, วันเวลา, ราคา
- ปุ่ม "ยืนยันราคา" สำหรับเจ้าของกระทู้
- ถอน/แก้ไข ใบเสนอราคาได้ก่อนยืนยัน
- สถานะ: รอพิจารณา / ยอมรับ / ปฏิเสธ / ถอนเอง

### 🔍 ค้นหาและกรอง
- ค้นหาจากหัวข้อ/รายละเอียด
- กรอง: ประเภทยานพาหนะ, ประเภทบริการ, จังหวัด, ความเร่งด่วน, ราคา, วันที่
- เรียง: ล่าสุด, เก่าสุด, ใบเสนอราคามากที่สุด, เร่งด่วนก่อน

### 🔔 Real-time & Notifications
- Supabase Realtime: อัปเดตใบเสนอราคาโดยไม่ต้อง refresh
- การแจ้งเตือนในแอพ + อีเมล
- แชทหลังยืนยันราคา (v1)

### 🇹🇭 Thai Localization
- สกุลเงิน THB (฿) พร้อม comma separator
- เวลาแบบ relative (เมื่อสักครู่, 2 ชั่วโมงที่แล้ว, 3 วันที่แล้ว)
- วันที่ปีพุทธศักราช (BE)
- ที่ตั้ง: จังหวัด → อำเภอ → ตำบล (autocomplete)
- Line ID + เบอร์โทร (แสดงหลังยืนยันราคา)

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Plain HTML + Vanilla JS (ES Modules) |
| **Styling** | CSS Custom Properties, Mobile-first responsive |
| **Backend/DB/Auth/Storage/Realtime** | Supabase (PostgreSQL) |
| **Deployment** | Cloudflare Pages |
| **Dependencies** | @supabase/supabase-js, marked, DOMPurify (via CDN + Import Maps) |

## 📁 โครงสร้างโปรเจกต์

```
ForumWebBoard/
├── index.html              # หน้าแรก
├── importmap.json          # Import maps สำหรับ CDN dependencies
├── _headers                # Cloudflare Pages headers
├── _redirects              # Cloudflare Pages redirects
├── wrangler.toml           # Cloudflare Pages config
├── css/
│   └── main.css            # Stylesheet หลัก
├── js/
│   ├── auth.js             # Shared auth module (Supabase client, helpers)
│   └── app.js              # Main entry point (header/footer injection)
├── pages/
│   ├── login.html          # เข้าสู่ระบบ
│   ├── register.html       # สมัครสมาชิก (เลือก role)
│   ├── forgot-password.html
│   ├── reset-password.html
│   ├── browse.html         # 瀏覽服務 + กรอง/ค้นหา
│   ├── post.html           # รายละเอียดกระทู้ + ใบเสนอราคา
│   ├── create-post.html    # สร้างกระทู้ใหม่
│   ├── dashboard.html      # แดชบอร์ดผู้ใช้
│   ├── my-posts.html       # กระทู้ของฉัน
│   ├── my-bids.html        # ใบเสนอราคาของฉัน (Provider only)
│   ├── profile.html        # โปรไฟล์
│   └── settings.html       # ตั้งค่า (การแจ้งเตือน, ความเป็นส่วนตัว, ความปลอดภัย)
├── supabase/
│   └── schema.sql          # Database schema + RLS policies + functions
└── README.md
```

## 🚀 การติดตั้งและรัน

### 1. สร้าง Supabase Project
1. ไปที่ [supabase.com](https://supabase.com) → New Project
2. บันทึก `Project URL` และ `anon public key`

### 2. รัน Database Schema
1. ใน Supabase Dashboard → SQL Editor
2. Copy เนื้อหา `supabase/schema.sql` วางรัน
3. สร้าง Storage Buckets:
   - `avatars` (Public, 2MB limit, image/*)
   - `post-images` (Public, 5MB limit, image/*)

### 3. ตั้งค่า Environment Variables
แก้ไข `js/auth.js`:
```javascript
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

### 4. Deploy ไป Cloudflare Pages
1. Push โค้ดไป GitHub
2. ใน Cloudflare Pages → Connect to Git
3. Build command: `echo 'Static site'`
4. Build output directory: `/` (root)
5. ตั้ง Environment Variables ใน Cloudflare Pages dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

### 5. ทดสอบ Local
```bash
# ใช้ HTTP server ใดๆ เช่น
npx serve .
# หรือ
python -m http.server 8000
# แล้วเปิด http://localhost:8000
```

## 🗄 Database Schema Highlights

### Tables
- **user_profiles** - ข้อมูลสมาชิก (extends auth.users)
- **posts** - กระทู้หาบริการ
- **bids** - ใบเสนอราคา
- **notifications** - การแจ้งเตือน
- **conversations** - ห้องแชท (หลังยืนยันราคา)
- **messages** - ข้อความแชท
- **reviews** - รีวิว/ให้คะแนน (v2)
- **favorites** - บันทึกกระทู้โปรด (v2)

### RLS Policies
- ทุกคนอ่าน posts, bids (ของกระทู้ที่เปิด) ได้
- สร้าง/แก้ไข/ลบเฉพาะเจ้าของข้อมูล
- Provider เท่านั้นที่ bid ได้
- ฟังก์ชัน `accept_bid()` จัดการ transaction: accept bid + reject others + update post status + create conversation + notifications

## 🔐 Authentication Flow

1. **สมัคร**: Email/Password + Role (Seeker/Provider) + Profile fields
2. **ยืนยันอีเมล** (Supabase จัดการ)
3. **เข้าสู่ระบบ** → JWT ใน localStorage
4. **Profile** สร้างอัตโนมัติผ่าน trigger/function

## 📱 Responsive Breakpoints

| Breakpoint | Width | Layout Changes |
|------------|-------|----------------|
| Mobile | < 640px | Single column, stacked cards |
| Tablet | 640-1023px | 2-column grids, sidebar below |
| Desktop | ≥ 1024px | 3-4 column grids, sticky sidebar |

## 🎨 Design System

### Colors
- **Primary**: `#2563eb` (Blue-600)
- **Secondary**: `#059669` (Emerald-600)
- **Danger**: `#dc2626` (Red-600)
- **Warning**: `#f59e0b` (Amber-500)
- **Info**: `#0891b2` (Cyan-600)

### Typography
- **Font**: Sarabun (Thai-optimized)
- **Scale**: xs(0.75rem) → 4xl(2.5rem)

### Spacing
- **Base**: 4px (--space-1 = 0.25rem)
- **Scale**: 1-16 (4px - 4rem)

## 📦 Import Maps (Zero Build)

```json
{
  "imports": {
    "@supabase/supabase-js": "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm",
    "marked": "https://cdn.jsdelivr.net/npm/marked@12/+esm",
    "dompurify": "https://cdn.jsdelivr.net/npm/dompurify@3/+esm"
  }
}
```

ใช้ใน HTML:
```html
<script type="importmap" src="/importmap.json"></script>
<script type="module">
  import { createClient } from '@supabase/supabase-js';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
</script>
```

## 🔮 Roadmap

### v1 (Current - Core)
- [x] Auth (2 roles)
- [x] Posts + Images
- [x] Bidding system
- [x] Accept/Reject bids
- [x] Search/Filter
- [x] Dashboard
- [x] Real-time updates

### v2 (Next)
- [ ] In-app chat (conversations + messages)
- [ ] Reviews & Ratings
- [ ] Favorites/Bookmarks
- [ ] Push notifications (Service Worker)
- [ ] Admin panel
- [ ] Provider verification badge

### v3 (Future)
- [ ] Payment integration (PromptPay, Stripe)
- [ ] Dispute resolution
- [ ] Mobile app (React Native / Flutter)
- [ ] Analytics dashboard

## 🤝 Contributing

1. Fork repo
2. Create feature branch
3. Commit changes
4. Push & create PR

## 📄 License

MIT License - ใช้งานได้อิสระ

## 📞 Support

- Issues: GitHub Issues
- Email: support@vehicleservice.example.com