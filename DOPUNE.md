# Oznake sadržaja i komentari

U produkciji od 16. 11. 2026. (grana `main`, https://gitara-hazel.vercel.app/).

- Crvena: sadržaj nedostaje ili nije dobar; plava: treba doradu. Ranija žuta oznaka sada se prikazuje plavo; postojeći podatkovni ključ `yellow` se zadržava radi kompatibilnosti. Oznaka se postavlja ručno i ne mijenja status učenja.
- Filter radi u oba taba i zajedno s pretragom; pretraga kao ranije obuhvata sve statuse.
- Komentari se otvaraju dugmetom uz Prikaz. Na računaru je to mali bočni panel, na telefonu donji panel. Otvara se samo na zahtjev. Nacrt ostaje lokalno sačuvan.

## Pohrana i kompatibilnost

Dopune su u `songDetails` unutar postojeće lokalne biblioteke `gitara-v2`. Stare biblioteke dobijaju prazne dopune, postojeće pjesme se ne označavaju automatski. JSON izvoz i uvoz obuhvataju pjesme i dopune; `.cho` ostaje format za akorde i tekst, bez komentara.

Ako je uključena GitHub sinhronizacija, dopune koriste **zaseban fajl `oznake-komentari.json`** u istom privatnom repou. `pjesme.json` zadržava postojeći format. Tako uređaj sa starijom verzijom aplikacije (npr. dok se keš ne osvježi) ne može obrisati oznake i komentare svojim upisom pjesama. Samo povezivanje ne pravi prazan fajl dopuna.

Oznake imaju vlastito vrijeme izmjene. Komentari se spajaju po ID-ju, pa komentari dodani na dva uređaja ostaju sačuvani. Brisanje komentara ostavlja zapis, da ga stariji uređaj ne vrati. Kod sukoba GitHub upisa aplikacija ponovo čita i spaja sadržaj prije ponovnog pokušaja. Nacrti komentara se ne šalju na GitHub.

Svaka adresa (produkcija, probna adresa grane) ima svoju lokalnu memoriju i svoj token. Browser provjere rade na lokalnoj adresi bez pravih kredencijala, a sinhronizacija se testira lažnim GitHubom bez pristupa pravim podacima.

## Provjere

```sh
node tests/chords.test.js
node tests/sync.test.js
node tests/details.test.js
python3 -m http.server 8765   # u korijenu repoa, pa u drugom terminalu:
node tests/e2e.js
```

Testovi dopuna pokrivaju staru pohranu, neispravne ulaze, promjenu i uklanjanje oznake, komentare s dva uređaja, brisanje, isti vremenski zapis, JSON izvoz/uvoz, odvojenu GitHub putanju i ponovni pokušaj pri sukobu. Browser test (`tests/e2e.js`, korak "oznake sadržaja, filter i komentari") provjerava oznaku iz pjesme i na kartici, da oznaka ne mijenja status, filter (crvena / bez oznake / sve), nacrt komentara nakon ponovnog učitavanja, dodavanje i brojač, ikonu na kartici i brisanje.

## Poznata ograničenja

- Na telefonu otvoren panel komentara prekriva dugme za automatsko listanje (listanje se pri otvaranju namjerno zaustavlja).
- Ako ne uspije samo upis oznaka i komentara, cijela sinhronizacija se prikaže kao greška, iako su pjesme već sinhronizovane.
- Obrisani komentari ostaju kao zapis o brisanju (zanemarivo malo podataka).
