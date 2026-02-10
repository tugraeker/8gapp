# 8GAPP Kapsamlı Test Senaryoları

Bu belge, 8GAPP uygulamasının temel işlevlerini doğrulamak için hazırlanan test senaryolarını içerir.

## 1. Kimlik Doğrulama ve Güvenlik (Authentication & Security)
- **TS1.1: Başarılı Giriş**: Doğru kullanıcı adı ve şifre ile sisteme giriş yapılabilmeli.
- **TS1.2: Hatalı Giriş**: Yanlış şifre veya kullanıcı adı ile "Hatalı kullanıcı adı veya şifre" uyarısı alınmalı.
- **TS1.3: Token Geçerliliği**: Geçersiz veya süresi dolmuş JWT token ile korumalı rotalara erişim engellenmeli (401 Unauthorized).
- **TS1.4: Yetkilendirme**: Öğrenci hesabı ile öğretmen paneli API'lerine (`/attendance/toggle`, `/points/bulk` vb.) erişim engellenmeli (403 Forbidden).
- **TS1.5: Şifre Değiştirme**: Mevcut şifre doğruysa şifre güncellenebilmeli; yanlışsa hata vermeli.
- **TS1.6: Küfür Filtresi**: Mesajlarda ve duyurularda küfürlü kelimeler engellenmeli.

## 2. Puan Sistemi (Points System)
- **TS2.1: Bireysel Puan Verme**: Öğretmen bir öğrenciye puan verebilmeli; puan hem `total_points` hem `spendable_points` alanlarına yansımalı.
- **TS2.2: Negatif Puan (Ceza)**: Negatif puan verildiğinde sadece `total_points` düşmeli, `spendable_points` değişmemeli (sıfırın altına inmemesi için).
- **TS2.3: Toplu Puan Verme**: Sınıfın tamamına (yok yazılanlar hariç) toplu puan verilebilmeli.
- **TS2.4: Real-time Güncelleme**: Puan verildiğinde öğrenci dashboard'unda puanlar yenileme yapmadan güncellenmeli (Socket.io).
- **TS2.5: Seviye Atama**: Puanlar arttıkça kullanıcının seviyesi (level) doğru hesaplanmalı ve progress bar güncellenmeli.

## 3. Yoklama Sistemi (Attendance)
- **TS3.1: Yoklama Durumu Değiştirme**: Öğretmen öğrenciyi "Var" veya "Yok" olarak işaretleyebilmeli.
- **TS3.2: Yoklama ve Puan İlişkisi**: "Yok" olarak işaretlenen öğrenciler toplu puan almamalı.
- **TS3.3: Günlük Sıfırlama**: Yoklama her gün otomatik olarak "Var" durumuna dönmeli (Cron Job).

## 4. Mağaza ve Envanter (Shop & Inventory)
- **TS4.1: Ürün Satın Alma**: Yeterli puan varsa ürün satın alınabilmeli; puan düşmeli ve envantere eklenmeli.
- **TS4.2: Yetersiz Puan**: Puan yetersizse satın alma engellenmeli.
- **TS4.3: Ücretsiz Ürünler**: Kıyafet kategorisindeki ürünler puansız olarak envantere eklenebilmeli.
- **TS4.4: Envanter Listeleme**: Satın alınan ürünler öğrenci envanterinde doğru şekilde görünmeli.

## 5. Avatar ve Gardrop (Avatar & Wardrobe)
- **TS5.1: Avatar Düzenleme**: Kullanıcı avatar parçalarını (saç, göz, kıyafet vb.) değiştirebilmeli ve kaydedebilmeli.
- **TS5.2: Kombin Kaydetme**: Mevcut avatar konfigürasyonu bir isimle gardroba kaydedilebilmeli.
- **TS5.3: Kombin Giyme**: Gardroptan seçilen bir kombin başarıyla uygulanmalı.
- **TS5.4: Kombin Silme**: Kayıtlı kombinler silinebilmeli.

## 6. Sosyal ve Duyurular (Social & Announcements)
- **TS6.1: Mesaj Gönderme**: Sınıf veya öğrenci grubuna mesaj gönderilebilmeli ve anında görünmeli.
- **TS6.2: Duyuru Yayınlama**: Öğretmen duyuru yayınlayabilmeli ve tüm öğrenciler dashboard'unda görebilmeli.
- **TS6.3: Oylama Oluşturma**: Öğretmen seçenekli oylama başlatabilmeli.
- **TS6.4: Oy Verme**: Öğrenciler her oylamada sadece bir kez oy verebilmeli; sonuçlar anlık güncellenmeli.

## 7. Görevler ve Rozetler (Missions & Rosettes)
- **TS7.1: Görev Tamamlama**: Belirlenen kriterler (örneğin mesaj gönderme) sağlandığında görev otomatik tamamlanmalı ve puan verilmeli.
- **TS7.2: Rozet Atama**: Öğretmen öğrenciye rozet verebilmeli; rozet öğrenci profilinde görünmeli.
