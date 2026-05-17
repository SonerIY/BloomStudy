# Bloom - Study Softly 🌸

Bloom, odaklanmayı artırmak ve çalışma verimliliğini maksimize etmek için tasarlanmış, modern bir "Dijital Çalışma Masası" (Study Assistant) uygulamasıdır. "Glassmorphism" tasarım diliyle geliştirilmiş olan Bloom, göz yormayan estetik arayüzü ile uzun çalışma seanslarında kullanıcılara eşlik eder.

## 🚀 Özellikler

- **Gelişmiş Pomodoro Sayacı:** Özelleştirilebilir odaklanma ve mola süreleri.
- **Sıfır Dikkat Dağınıklığı (Tam Odak Modu):** Tek tıkla ekrandaki tüm dikkat dağıtıcı unsurları gizleyip sadece sayaca odaklanma imkanı.
- **Bulut Senkronizasyonu:** Firebase altyapısı sayesinde e-posta veya Google ile giriş yapıp tüm verilerinizi (görevler, istatistikler, yanlış defteri) bulutta yedekleme.
- **Çevrimdışı (Offline-First) Destek:** İnternetiniz koptuğunda bile (PWA mantığıyla) local storage üzerinden sorunsuz çalışmaya devam eder, internet geldiğinde verileri bulutla eşitler.
- **Ortam Sesleri:** "Sinematik Saat", "Eski Duvar Saati" gibi odaklanmayı kolaylaştıran entegre ses efektleri.
- **Görev ve Hedef Takibi:** Günlük planlama, soru/yanlış takibi ve öğrenci metrikleri.
- **Çiçek Bahçesi (Oyunlaştırma):** Çalıştıkça büyüyen ve kullanıcıyı motive eden görsel ödül sistemi.

## 💻 Teknolojiler

- **Frontend:** Vanilla HTML5, CSS3 (Custom Variables, Flexbox, CSS Grid), Vanilla JavaScript (ES6+).
- **Backend / Veritabanı:** Firebase (Authentication, Cloud Firestore).
- **Tasarım Konsepti:** Glassmorphism, Dark/Light Mode desteği, Responsive Design (Mobil uyumlu).

## 🔒 Güvenlik

- Kullanıcı şifreleri Google Identity Toolkit (Firebase) altyapısıyla güvenle şifrelenir.
- Firestore Güvenlik Kuralları ile veriler izole edilmiştir.
- Hatalı girişlere karşı e-posta doğrulama ve şifre kuralları (regex) mevcuttur.

---
*Bu proje, modern web geliştirme standartları (UI/UX) dikkate alınarak tasarlanmıştır.*
