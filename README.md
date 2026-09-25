# NM Finance

Statisk app med Supabase Auth og Postgres. Åpne i en lokal webserver eller publiser som statisk nettsted.

## Database

1. Ta sikkerhetskopi av eksisterende data. Inspiser `supabase/setup.sql` før kjøring; den legger til kolonner i eksisterende tabeller og erstatter eksisterende RLS-policyer på `public.budgets`, `public.budget_members` og `public.transactions`.
2. Kjør `supabase/setup.sql` én gang i SQL Editor i Supabase-prosjektet som er konfigurert i `app.js`. SQL er tilpasset tabellskjemaet du viste: `budgets(title,total_amount,start_date,end_date,created_by)`, `budget_members(id,budget_id,user_id,role)`, `transactions` og `profiles(id,username)`. Triggeren `on_auth_user_created` på `auth.users` beholdes; `ProfileAndAuth` på `public.profiles` må ikke gjenopprettes.
3. Sett nettstedets adresse under Authentication → URL Configuration. Aktiver e-postlevering/bekreftelse etter behov. Publiser `index.html`, `app.js`, `style.css` og `netlify.toml`.

Hver liste har en første start/sluttdato. Den samme datoperioden gjentas månedlig. Start og slutt må være i samme syklus (slutt før neste måneds start); tomrom mellom perioder er tillatt. Tidligere perioder og betalinger beholdes. Personlige betalinger i en delt liste er kun synlige for den som registrerte dem. Felles betalinger er synlige for alle medlemmer. Dashboardet viser personlige og felles betalinger separat, og summer per kategori uten å telle samme betaling to ganger.

Eksisterende kjøp beholdes som personlige betalinger i kategorien Annet, med eksisterende budsjettilknytning hvis den finnes. Historiske personlige kjøp deles ikke automatisk med nye medlemmer. Brukernavnssøk krever at `public.profiles` har `username`; hvis to personer har samme brukernavn returneres en tvetydighetsfeil, og e-post kan brukes.
