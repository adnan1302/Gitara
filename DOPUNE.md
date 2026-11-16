# Oznake sadržaja i komentari

Eksperimentalna dopuna na grani `claude/project-thread-5f9k6v`. Produkcijska grana `main` nije promijenjena.

- Crvena: sadržaj nedostaje ili nije dobar; žuta: treba doradu. Oznaka se postavlja ručno i ne mijenja status učenja.
- Filter radi u oba taba i zajedno s pretragom; pretraga kao ranije obuhvata sve statuse.
- Komentari se otvaraju dugmetom uz Prikaz. Na računaru je to mali bočni panel, na telefonu donji panel. Otvara se samo na zahtjev. Nacrt ostaje lokalno sačuvan.

## Pohrana i kompatibilnost

Dopune su u `songDetails` unutar postojeće lokalne biblioteke `gitara-v2`. Stare biblioteke dobijaju prazne dopune, postojeće pjesme se ne označavaju automatski. JSON izvoz i uvoz obuhvataju pjesme i dopune; `.cho` ostaje format za akorde i tekst, bez komentara.

Ako je uključena postojeća GitHub sinhronizacija, dopune koriste **zaseban fajl `oznake-komentari.json`** u istom privatnom repou. `pjesme.json` zadržava postojeći format. Tako produkcijska aplikacija, koja još ne poznaje dopune, ne može obrisati oznake i komentare svojim upisom pjesama. Samo povezivanje ne pravi prazan fajl dopuna.

Oznake imaju vlastito vrijeme izmjene. Komentari se spajaju po ID-ju, pa komentari dodani na dva uređaja ostaju sačuvani. Brisanje komentara ostavlja zapis, da ga stariji uređaj ne vrati. Kod sukoba GitHub upisa aplikacija ponovo čita i spaja sadržaj prije ponovnog pokušaja. Nacrti komentara se ne šalju na GitHub.

Ako se ista biblioteka ili privatni repo koriste na testnoj i produkcijskoj adresi, postojeća sinhronizacija pjesama i dalje prenosi izmjene pjesama između njih. Nova funkcija ne mijenja tu postavku. Browser provjere rade na zasebnom lokalnom porijeklu bez korisničkih kredencijala, a mrežna sinhronizacija se testira zamjenskim GitHub klijentom bez pristupa pravim podacima.

## Provjere

```sh
node tests/chords.test.js
node tests/sync.test.js
node tests/details.test.js
```

Testovi dopuna pokrivaju staru pohranu, neispravne ulaze, promjenu i uklanjanje oznake, komentare s dva uređaja, brisanje, isti vremenski zapis, JSON izvoz/uvoz, odvojenu GitHub putanju i ponovni pokušaj pri sukobu. Browser provjere obuhvataju oznake/filter, komentare i nacrte nakon ponovnog učitavanja te telefon i oba moda.
