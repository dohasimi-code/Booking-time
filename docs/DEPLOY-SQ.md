# Si ta vendosni aplikacionin në internet

Duhen rreth 15 minuta. Nuk keni nevojë të shkruani asnjë komandë.

## Hapi 1: Baza e të dhënave (Supabase)

1. Hapni **supabase.com** dhe klikoni **New project**.
2. **Name:** `booking-time`.
3. **Database password:** klikoni **Generate a password** (ose shkruani një që ka vetëm shkronja dhe numra). **Kopjojeni dhe ruajeni diku.**
4. **Region:** zgjidhni **Central EU (Frankfurt)**. Klikoni **Create new project** dhe prisni 1–2 minuta.
5. Lart në faqe klikoni butonin **Connect**.
6. Te **Connection string** zgjidhni **Transaction pooler** dhe kopjoni lidhjen që fillon me `postgresql://…`
7. Në atë lidhje, zëvendësoni `[YOUR-PASSWORD]` me fjalëkalimin nga hapi 3 (pa kllapat `[ ]`).
   Kjo është **lidhja e bazës**. Mos ia tregoni askujt.

## Hapi 2: Faqja (Vercel)

1. Hapni **vercel.com**, klikoni **Add New… → Project**.
2. Te lista e GitHub-it gjeni **Booking-time** dhe klikoni **Import**.
3. Hapni **Environment Variables** dhe shtoni dy rreshta:

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | lidhja e bazës nga Hapi 1 |
   | `ADMIN_SETUP_CODE` | një kod sekret që e zgjidhni vetë, p.sh. `molla-e-kuqe-2026` (të paktën 8 shkronja) |

4. Klikoni **Deploy** dhe prisni 2–3 minuta derisa të shfaqet **Congratulations**.
5. Klikoni **Continue to Dashboard**. Lart do të shihni adresën e faqes, p.sh. `booking-time-xyz.vercel.app`.

## Hapi 3: Krijoni hyrjen tuaj

1. Hapni `https://<adresa-juaj>/admin/setup`.
2. Shkruani kodin sekret nga Hapi 2, email-in tuaj dhe një fjalëkalim (të paktën 12 shkronja).
3. Klikoni **Create login**. Tani jeni brenda panelit tuaj.

Kjo faqe funksionon vetëm një herë. Pas kësaj hyni gjithmonë te `https://<adresa-juaj>/admin`.

## Lidhja për t'u dërguar njerëzve

`https://<adresa-juaj>/book/donald`

Dërgojeni me email, WhatsApp, SMS ose LinkedIn.

## Më vonë (opsionale)

- **Domain-i juaj** (p.sh. `book.donald.com`): Vercel → projekti → **Settings → Domains**.
- **Email-et e konfirmimit:** krijoni llogari në **resend.com** dhe më shkruani. Ju udhëzoj unë.
