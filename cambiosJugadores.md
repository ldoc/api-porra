# Cambios jugadores — filtrado listas oficiales UEFA Champions 2026/27

Se eliminan del `data/sofascore/jugadores.json` y de `data/sofascore/imgJugadores/` los jugadores que no están en la plantilla oficial UEFA (`/squad`) de su equipo o que llevan asterisco (lista B). Fuente: https://es.uefa.com/uefachampionsleague/clubs/ (scrapeado con Chrome headless 2026-09-04). Backup previo en `/tmp/opencode/jugadores.json.bak-20260904`.

## AEK Athens (id 3250) — OK usuario

Totales: json 1024 → 1009 global (equipo: 21 mantener, 14 no en lista, 1 lista B). Fotos borradas: 15.

### Incluidos (21)

- Charalampos Lykogiannis (D) id=98212
- Domagoj Vida (D) id=51225
- Filipe Relvas (D) id=1131931
- Harold Moukoudi (D) id=795128
- Lazaros Rota (D) id=941338
- Stavros Pilios (D) id=974076
- Barnabás Varga (F) id=852434
- Luka Jović (F) id=319129
- Zini (F) id=1002334
- Alberto Brignoli (G) id=142904
- Thomas Strakosha (G) id=227212
- Aboubakary Koita (M) id=890110 [posición UEFA F ≠ json M]
- João Mário (M) id=97001 [posición UEFA F ≠ json M]
- Kaan Kairinen (M) id=547862
- Kervin Arriaga (M) id=1083832
- Lovro Majer (M) id=841947
- Mijat Gaćinović (M) id=190917
- Milán Vitális (M) id=1098193
- Oleksandr Zubkov (M) id=353282 [posición UEFA F ≠ json M]
- Petros Mantalos (M) id=80465
- Răzvan Marin (M) id=279563

### Excluidos (15)

- Anastasios Loupas (D) id=2165593 — no está en la lista oficial UEFA
- Christos Alexiou (D) id=1154602 — no está en la lista oficial UEFA
- Martin Georgiev (D) id=1141469 — no está en la lista oficial UEFA
- Spyros Christakopoulos (D) id=2657920 — no está en la lista oficial UEFA
- Argyris Argyriou (F) id=2465811 — no está en la lista oficial UEFA
- Frantzdy Pierrot (F) id=943278 — no está en la lista oficial UEFA
- Nikolaos Vlioras (F) id=1176700 — no está en la lista oficial UEFA
- Zois Karargyris (F) id=1587245 — no está en la lista oficial UEFA
- Georgios Sarakasidis (G) id=2354560 — no está en la lista oficial UEFA
- Marios Balamotis (G) id=2171165 — asterisco/lista B (UEFA: Marios Balamotis)
- Christos Paleologou (M) id=2398893 — no está en la lista oficial UEFA
- Dereck Kutesa (M) id=789984 — no está en la lista oficial UEFA
- Dimitrios Kaloskamis (M) id=1150242 — no está en la lista oficial UEFA
- Hakim Sahabo (M) id=1434757 — no está en la lista oficial UEFA
- Hamed Kader Fofana (M) id=1616643 — no está en la lista oficial UEFA

## Arsenal (id 42) — OK usuario

Totales: json 1009 → 1006 global (equipo: 22 mantener, 3 no en lista, 0 lista B). Fotos borradas: 3.

### Incluidos (22)

- Ben White (D) id=846036
- Cristhian Mosquera (D) id=1144630
- Ezri Konsa (D) id=827679
- Gabriel Magalhães (D) id=869792
- Jurriën Timber (D) id=958959
- Piero Hincapié (D) id=1002837
- Riccardo Calafiori (D) id=957602
- William Saliba (D) id=941168
- Bukayo Saka (F) id=934235
- Kai Havertz (F) id=836705 [posición UEFA M ≠ json F]
- Noni Madueke (F) id=966547 [posición UEFA M ≠ json F]
- Viktor Gyökeres (F) id=804508
- David Raya (G) id=581310
- Illan Meslier (G) id=906076
- Kepa Arrizabalaga (G) id=232422
- Bruno Guimarães (M) id=866469
- Christos Tzolis (M) id=1031259 [posición UEFA F ≠ json M]
- Declan Rice (M) id=856714
- Eberechi Eze (M) id=864921
- Martin Ødegaard (M) id=547410
- Martín Zubimendi (M) id=966837
- Mikel Merino (M) id=592010

### Excluidos (3)

- Myles Lewis-Skelly (D) id=1423711 — no está en la lista oficial UEFA
- Gabriel Martinelli (F) id=922573 — no está en la lista oficial UEFA (colisión con Gabriel Magalhães por el 'Gabriel' de UEFA)
- Max Dowman (M) id=1917626 — no está en la lista oficial UEFA

## Aston Villa (id 40) — OK usuario

Totales: json 1007 → 1000 global (equipo: 23 mantener, 7 no en lista, 0 lista B). Fotos borradas: 7.

### Incluidos (23)

- Aaron Wan-Bissaka (D) id=863653
- Ian Maatsen (D) id=976263
- Matteo Ruggeri (D) id=965011
- Matty Cash (D) id=833956
- Pau Torres (D) id=864169
- Tyrone Mings (D) id=303638
- Victor Lindelöf (D) id=143334
- Alejandro Garnacho (F) id=1135873
- Ibrahim Mbaye (F) id=1590918
- Nicolas Jackson (F) id=1085381
- Tammy Abraham (F) id=610766
- James Wright (G) id=1138445
- Marco Bizot (G) id=100390
- Zion Suzuki (G) id=905351
- Alysson (M) id=1631879 [posición UEFA F ≠ json M]
- Boubacar Kamara (M) id=826204
- Emiliano Buendía (M) id=783126 [posición UEFA F ≠ json M]
- Johan Manzambi (M) id=1518931
- John McGinn (M) id=250223
- João Gomes (M) id=1015267
- Lamare Bogarde (M) id=1089388 [posición UEFA D ≠ json M]
- Leon Goretzka (M) id=184661
- Ross Barkley (M) id=98435

### Excluidos (7)

- Modou Kéba Cissé (D) id=1944705 — no está en la lista oficial UEFA
- Taylor Harwood-Bellis (D) id=980637 — no está en la lista oficial UEFA
- Brian Madjo (F) id=2070311 — no está en la lista oficial UEFA
- Leon Bailey (F) id=808590 — no está en la lista oficial UEFA
- Owen Asemota (G) id=2725908 — no está en la lista oficial UEFA
- Amadou Onana (M) id=923973 — no está en la lista oficial UEFA
- George Hemmings (M) id=1398204 — no está en la lista oficial UEFA

## Atlético Madrid (id 2836) — OK usuario

Totales: json 1001 → 998 global (equipo: 24 mantener, 3 no en lista, 0 lista B). Fotos borradas: 3.

### Incluidos (24)

- Arnau Solà (D) id=997025
- Cristian Romero (D) id=829932
- Dani Martinez (D) id=1414932
- Dávid Hancko (D) id=807771
- Marc Pubill (D) id=1094106
- Marcos Llorente (D) id=353138 [posición UEFA M ≠ json D]
- Robin Le Normand (D) id=787751
- Ademola Lookman (F) id=824200
- Alexander Sørloth (F) id=309078
- Jonathan David (F) id=935564
- Julián Alvarez (F) id=944656
- Jan Oblak (G) id=69768
- Juan Musso (G) id=263651
- Alejandro Grimaldo (M) id=177177 [posición UEFA D ≠ json M]
- Alex Baena (M) id=910031
- Arnau Ortiz (M) id=1143553 [posición UEFA F ≠ json M]
- Giuliano Simeone (M) id=1099352 [posición UEFA F ≠ json M]
- Johnny Cardoso (M) id=990169
- Kang-in Lee (M) id=917087
- Koke (M) id=84539
- Morten Hjulmand (M) id=859917
- Obed Vargas (M) id=1119345
- Pablo Barrios (M) id=1142588
- Rodrigo Mendoza (M) id=1391752

### Excluidos (3)

- Jorge Domínguez (D) id=2271379 — no está en la lista oficial UEFA
- Salvi Esquivel (G) id=1179149 — no está en la lista oficial UEFA
- Carlos Martín (M) id=1131581 — no está en la lista oficial UEFA

## Borussia Dortmund (id 2673) — OK usuario

Totales: json 998 → 992 global (equipo: 24 mantener, 3 no en lista, 3 lista B). Fotos borradas: 6.

### Incluidos (24)

- Filippo Mané (D) id=1137131
- Joane Gadou (D) id=1471049
- Kauã Prates (D) id=1887796
- Nico Schlotterbeck (D) id=940871
- Ramy Bensebaini (D) id=577726
- Waldemar Anton (D) id=799046
- Fábio Silva (F) id=954076
- Maximilian Beier (F) id=980628
- Serhou Guirassy (F) id=328027
- Alexander Meyer (G) id=138491
- Gregor Kobel (G) id=556866
- Patrick Drewes (G) id=132607
- Silas Ostrzinski (G) id=1140591
- Carney Chukwuemeka (M) id=994556
- Daniel Svensson (M) id=1021272 [posición UEFA D ≠ json M]
- Enzo Duarte (M) id=1957706
- Ethan Nwaneri (M) id=1401702
- Felix Nmecha (M) id=907463
- Jobe Bellingham (M) id=1134083 [posición UEFA F ≠ json M]
- Joey Veerman (M) id=850816
- Julian Ryerson (M) id=800951 [posición UEFA D ≠ json M]
- Konstantinos Karetsas (M) id=1468744 [posición UEFA F ≠ json M]
- Marcel Sabitzer (M) id=133908
- Mussa Kaba (M) id=1931662

### Excluidos (6)

- Emre Can (D) id=138156 — no está en la lista oficial UEFA
- Luca Reggiani (D) id=1937833 — asterisco/lista B (UEFA: Luca Reggiani)
- Mathis Albert (F) id=1937835 — asterisco/lista B (UEFA: Matthies Albert) [match por variante de nombre]
- Giannis Konstantelias (M) id=1002007 — no está en la lista oficial UEFA
- Justin Lerma (M) id=1836843 — no está en la lista oficial UEFA
- Samuele Inacio (M) id=1861666 — asterisco/lista B (UEFA: Samuele Inacio)

## FC Barcelona (id 2817) — OK usuario

Totales: json 992 → 989 global (equipo: 25 mantener, 3 no en lista, 0 lista B). Fotos borradas: 3.

### Incluidos (25)

- Alejandro Balde (D) id=997035
- Andreas Christensen (D) id=186795
- Eric García (D) id=876214
- Gerard Martín (D) id=1094827
- João Cancelo (D) id=138892
- Jules Koundé (D) id=827212
- Pau Cubarsí (D) id=1402913
- Xavi Espart (D) id=1546073
- Anthony Gordon (F) id=914902
- Gabriel Jesus (F) id=794839
- Hamza Abdelkarim (F) id=1961596
- Karim Adeyemi (F) id=940054
- Dominik Livaković (G) id=190419
- Joan García (G) id=930267
- Wojciech Szczęsny (G) id=50490
- Dani Olmo (M) id=789071 [posición UEFA F ≠ json M]
- Fermín López (M) id=1153270 [posición UEFA F ≠ json M]
- Frenkie de Jong (M) id=795222
- Gavi (M) id=1103693
- Jesse Bisiwu (M) id=1506988 [posición UEFA F ≠ json M]
- Lamine Yamal (M) id=1402912 [posición UEFA F ≠ json M]
- Marc Bernal (M) id=1526618
- Pedri (M) id=992587
- Raphinha (M) id=831005 [posición UEFA F ≠ json M]
- Rodri (M) id=827606

### Excluidos (3)

- Jordi Pesquer (D) id=2128094 — no está en la lista oficial UEFA
- Roony Bardghji (F) id=1162107 — no está en la lista oficial UEFA
- Brian Fariñas (M) id=1544613 — no está en la lista oficial UEFA

## FC Bayern München (id 2672) — OK usuario

Totales: json 991 → 990 global (equipo: 24 mantener, 1 no en lista, 0 lista B). Fotos borradas: 1.

### Incluidos (24)

- Alphonso Davies (D) id=843665 [posición UEFA M ≠ json D]
- Dayot Upamecano (D) id=798583
- Hiroki Itō (D) id=873106
- Jonathan Tah (D) id=227672
- Josip Stanišić (D) id=927407
- Kim Min-jae (D) id=896569 [variante de 'Minjae Kim']
- Konrad Laimer (D) id=355492 [posición UEFA M ≠ json D]
- Nathaniel Brown (D) id=1159759
- Sacha Boey (D) id=980418
- Bastian Assomo (F) id=2361805
- Harry Kane (F) id=108579
- Jonas Urbig (G) id=1130647
- Manuel Neuer (G) id=8959
- Sven Ulreich (G) id=26768
- Aleksandar Pavlović (M) id=1142251
- Bara Sapoko Ndiaye (M) id=2427970
- Ismael Saibari (M) id=1063767
- Jamal Musiala (M) id=1010231
- Joshua Kimmich (M) id=259117
- Luis Díaz (M) id=883537 [posición UEFA F ≠ json M]
- Maycon Cardozo (M) id=2236502 [posición UEFA F ≠ json M]
- Michael Olise (M) id=978838
- Serge Gnabry (M) id=187433 [posición UEFA F ≠ json M]
- Tom Bischof (M) id=1129935

### Excluidos (1)

- Lennart Karl (M) id=1861975 — no está en la lista oficial UEFA

## Bodø/Glimt (id 656) — OK usuario

Totales: json 991 → 989 global (equipo: 23 mantener, 1 no en lista, 1 lista B). Fotos borradas: 2.

### Incluidos (23)

- Assan Sanyang (D) id=1104398 [posición UEFA M ≠ json D; añadido manual 2026-09-04: en Sofascore está en Bombada FC (fichaje reciente), foto 404 → placeholder]
- Fredrik André Bjørkan (D) id=795154 [variante de 'Fredrik Bjørkan']
- Fredrik Sjøvold (D) id=1172777 [posición UEFA M ≠ json D]
- Haitam Aleesami (D) id=250319
- Isak Dybvik Määttä (D) id=980915 [variante de 'Isak Määttä'; posición UEFA F ≠ json D]
- Jostein Gundersen (D) id=548692
- Odin Luras Bjørtuft (D) id=929978 [variante de 'Odin Bjørtuft']
- Villads Nielsen (D) id=1506781
- Andreas Helmersen (F) id=793524
- August Mikkelsen (F) id=943193 [posición UEFA M ≠ json F]
- Jens Petter Hauge (F) id=838805
- Ola Brynhildsen (F) id=877364
- Ole Didrik Blomberg (F) id=1007769
- Julian Lund (G) id=814784 [variante de 'Julian Faye Lund']
- Nikita Haikin (G) id=792624
- Håkon Evjen (M) id=892943
- Joel Mugisha Mvuka (M) id=1027091 [variante de 'Joel Mvuka'; posición UEFA F ≠ json M]
- Joshua Kitolano (M) id=913584
- Magnus Riisnæs (M) id=1120290
- Patrick Berg (M) id=355174
- Sondre Auklend (M) id=1029163
- Sondre Fet (M) id=567236 [variante de 'Sondre Brunstad Fet']
- Ulrik Saltnes (M) id=151700

### Excluidos (2)

- Mikkel Bro Hansen (F) id=2031918 — no está en la lista oficial UEFA
- Isak Sjong (G) id=1470492 — asterisco/lista B (UEFA: Isak Sjong)

## Club Brugge KV (id 2888) — OK usuario

Totales: json 993 → 986 global (equipo: 25 mantener, 7 no en lista, 0 lista B). Fotos borradas: 7.

### Incluidos (25)

- Andre Garcia (D) id=1901084
- Brandon Mechele (D) id=248331
- Han-Beom Lee (D) id=1002448
- Hugo Siquet (D) id=983041
- Joel Ordóñez (D) id=1187275
- Matteo Dams (D) id=1162305
- Samba Coulibaly (D) id=2267145
- Samuel Gomez Van Hoogen (D) id=1465817 [variante de 'Samuel Van Hoogen']
- Andrej Vasovic (F) id=1542032
- Mamadou Diakhon (F) id=1495876
- Nicolò Tresoldi (F) id=1177167
- Romeo Vermant (F) id=1069336
- Wisdom Mike (F) id=1976732
- Nordin Jackers (G) id=361722
- Yann Sommer (G) id=16206
- Carlos Forbs (M) id=1069486 [posición UEFA F ≠ json M]
- Cheveyo Tsawa (M) id=1417029
- Freddie Potts (M) id=1089582
- Félix Lemaréchal (M) id=1130942
- Hans Vanaken (M) id=118085
- Hugo Vetlesen (M) id=877236
- Jan Virgili (M) id=1939173 [posición UEFA F ≠ json M]
- Lynnt Audoor (M) id=1067539
- Milan Robberechts (M) id=1128428 [posición UEFA F ≠ json M]
- Tian Nai Koren (M) id=1939849 [variante de 'Tian Koren']

### Excluidos (7)

- Joaquin Seys (D) id=1395881 — no está en la lista oficial UEFA
- Jorne Spileers (D) id=1104897 — no está en la lista oficial UEFA
- Kyriani Sabbe (D) id=1101258 — no está en la lista oficial UEFA
- Argus Vanden Driessche (G) id=1403045 — no está en la lista oficial UEFA
- Axl De Corte (G) id=1403043 — no está en la lista oficial UEFA
- Gianluca Okon (M) id=2613180 — no está en la lista oficial UEFA
- Gianluca Okon-Engstler (M) id=1974982 — no está en la lista oficial UEFA

## Como (id 2704) — OK usuario

Totales: json 986 → 978 global (equipo: 21 mantener, 8 no en lista, 0 lista B). Fotos borradas: 8.

### Incluidos (21)

- Alberto Dossena (D) id=870211
- Ivan Smolčić (D) id=974581
- Jacobo Ramón (D) id=1403348
- Kaiki (D) id=1112484 [variante de 'Kaiki Bruno']
- Marc Kempf (D) id=226974 [variante de 'Marc-Oliver Kempf']
- Trevoh Chalobah (D) id=826134
- Álex Valle (D) id=1142238
- Anastasios Douvikas (F) id=894863
- Mattia Liberali (F) id=1475557 [posición UEFA M ≠ json F]
- Moise Kean (F) id=835601
- Jean Butez (G) id=599114
- Robert Sánchez (G) id=920546
- Assane Diao (M) id=1493689 [posición UEFA F ≠ json M]
- Jesús Rodriguez (M) id=1800245 [posición UEFA F ≠ json M]
- Lucas Da Cunha (M) id=911848
- Luis Milla (M) id=811629
- Martin Baturina (M) id=1090019
- Máximo Perrone (M) id=1086286
- Nico Paz (M) id=1171451 [variante de 'Nicolás Paz']
- Samuele Ricci (M) id=930189
- Yan Couto (M) id=1002813 [posición UEFA D ≠ json M]

### Excluidos (8)

- Edoardo Goldaniga (D) id=295133 — no está en la lista oficial UEFA
- Willy Kambwala (D) id=1136721 — no está en la lista oficial UEFA
- Marlon Mustapha (F) id=1006951 — no está en la lista oficial UEFA
- Mauro Vigorito (G) id=41444 — no está en la lista oficial UEFA
- Adrian Lahdo (M) id=1802689 — no está en la lista oficial UEFA
- Jayden Addai (M) id=1177723 — no está en la lista oficial UEFA
- Luca Mazzitelli (M) id=369866 — no está en la lista oficial UEFA
- Maxence Caqueret (M) id=859027 — no está en la lista oficial UEFA

### Solo en UEFA, sin acción (1)

- Tasos Douvikas (F) — cubierto como \'Anastasios Douvikas' (ver Incluidos/Dudas resueltas)

## Fenerbahçe (id 3052) — OK usuario

Totales: json 978 → 969 global (equipo: 24 mantener, 8 no en lista, 1 lista B). Fotos borradas: 9.

### Incluidos (24)

- Archie Brown (D) id=1009738 [posición UEFA M ≠ json D]
- Kojo Peprah Oppong (D) id=1473092
- Levent Mercan (D) id=1085938 [posición UEFA M ≠ json D]
- Mert Müldür (D) id=836683
- Milan Škriniar (D) id=187205
- Nathan Aké (D) id=149663
- Nélson Semedo (D) id=252821
- Ognjen Mimović (D) id=1146274
- Yiğit Efe Demir (D) id=1133200
- Dorgeles Nene (F) id=1102788
- Kerem Aktürkoğlu (F) id=903324
- Romelu Lukaku (F) id=78893
- Vedat Muriqi (F) id=310874
- Ederson (G) id=254491
- Mert Günok (G) id=39573
- Tarık Çetin (G) id=913985
- Bartuğ Elmaz (M) id=997165
- Marco Asensio (M) id=361004 [posición UEFA F ≠ json M]
- Mason Greenwood (M) id=942116 [posición UEFA F ≠ json M]
- Mattéo Guendouzi (M) id=852404
- N'Golo Kanté (M) id=234148
- Oğuz Aydın (M) id=999396
- İrfan Can Kahveci (M) id=226986
- İsmail Yüksek (M) id=952600

### Excluidos (9)

- Jayden Oosterwolde (D) id=1048324 — no está en la lista oficial UEFA
- Rodrigo Becão (D) id=880207 — no está en la lista oficial UEFA
- Çağlar Söyüncü (D) id=758608 — no está en la lista oficial UEFA
- Adem Yeşilyurt (F) id=2437632 — no está en la lista oficial UEFA
- Amara Diouf (F) id=1536761 — no está en la lista oficial UEFA
- Emin Eren Sayar (F) id=2128112 — asterisco/lista B (UEFA: Emin Sayar) [match por variante de nombre]
- Abdou Aziz Fall (M) id=1542689 — no está en la lista oficial UEFA
- Mert Hakan Yandaş (M) id=856849 — no está en la lista oficial UEFA
- Talisca (M) id=329245 — no está en la lista oficial UEFA

## Feyenoord (id 2959) — OK usuario

Totales: json 972 → 963 global (equipo: 24 mantener, 3 no en lista, 6 lista B). Fotos borradas: 9.

### Incluidos (24)

- Bart Nieuwkoop (D) id=797279
- Gijs Smal (D) id=860160
- Javi López (D) id=945404
- Jeremiah St Juste (D) id=787640
- Jordan Bos (D) id=1144138
- Mats Deijl (D) id=794013
- Tsuyoshi Watanabe (D) id=942213
- Jerayno Schaken (F) id=2256582
- Nacho Ferri (F) id=1196903
- Florian Kastenmeier (G) id=795024
- Liam Bossin (G) id=307364
- Mannou Berger (G) id=1390118
- Tjark Ernst (G) id=1019319
- Anis Hadj Moussa (M) id=1218066 [posición UEFA F ≠ json M]
- Charles Vanhoutte (M) id=928033
- Gaoussou Diarra (M) id=1918931 [posición UEFA F ≠ json M]
- Gjivai Zechiël (M) id=1433802
- Gonçalo Borges (M) id=979221 [posición UEFA F ≠ json M]
- Jakub Moder (M) id=886242
- Luciano Valente (M) id=1121400
- Mika Medina (M) id=979145 [posición UEFA D ≠ json M; añadido manual 2026-09-04: en Sofascore está en Barcelona U19 (fichaje reciente), foto 404 → placeholder]
- Oussama Targhalline (M) id=1095731
- Reiss Nelson (M) id=826139 [posición UEFA F ≠ json M]
- Sem Steijn (M) id=944467

### Excluidos (9)

- Givairo Read (D) id=1388535 — asterisco/lista B (UEFA: Givairo Read)
- Jordan Lotomba (D) id=796279 — no está en la lista oficial UEFA
- Mika Mármol (D) id=979146 — no está en la lista oficial UEFA
- Thomas Beelen (D) id=1127916 — no está en la lista oficial UEFA
- Tijme Wessels (D) id=1939010 — asterisco/lista B (UEFA: Tijme Wessels)
- Jivayno Zinhagel (F) id=2014656 — asterisco/lista B (UEFA: Jivayno Zinhagel)
- Shaqueel van Persie (F) id=1470002 — asterisco/lista B (UEFA: Shaqueel Van Persie)
- Thijs Kraaijeveld (M) id=1384486 — asterisco/lista B (UEFA: Thijs Kraaijeveld)
- Tobias van den Elshout (M) id=1939011 — asterisco/lista B (UEFA: Tobias Van Den Elshout)

### Solo en UEFA, sin acción (1)

- Jerry St. Juste (D) — cubierto como \'Jeremiah St Juste' (ver Incluidos/Dudas resueltas)

## Galatasaray (id 3061) — OK usuario

Totales: json 963 → 954 global (equipo: 24 mantener, 7 no en lista, 2 lista B). Fotos borradas: 9.

### Incluidos (24)

- Abdülkerim Bardakcı (D) id=178963
- Davinson Sánchez (D) id=566102
- El Chadaille Bitshiabu (D) id=1048009
- Eren Elmalı (D) id=981483
- Ismail Jakobs (D) id=897291
- Roland Sallai (D) id=355088
- Wilfried Singo (D) id=978285
- Deniz Gül (F) id=1407720
- Rafael Leão (F) id=851284
- Victor Osimhen (F) id=822471
- Enes Emre Büyük (G) id=1405619 [variante de 'Enes Büyük']
- Günay Güvenç (G) id=103457
- Jankat Yılmaz (G) id=1210422
- Uğurcan Çakır (G) id=754330
- Aleksey Batrakov (M) id=1415147
- Barış Alper Yılmaz (M) id=904096 [posición UEFA F ≠ json M]
- Gabriel Sara (M) id=913593
- Leroy Sané (M) id=293519 [posición UEFA F ≠ json M]
- Lesley Ugochukwu (M) id=1048916
- Lucas Torreira (M) id=754794
- Mario Lemina (M) id=307284
- Renato Nhaga (M) id=2119726 [variante de 'Renato Sam-Na Nhaga']
- Yunus Akgün (M) id=857738 [posición UEFA F ≠ json M]
- İlkay Gündoğan (M) id=45853

### Excluidos (9)

- Arda Ünyay (D) id=1464636 — no está en la lista oficial UEFA
- Kaan Ayhan (D) id=138152 — no está en la lista oficial UEFA
- Kazımcan Karataş (D) id=1008884 — no está en la lista oficial UEFA
- Ada Yüzgeç (F) id=2128081 — asterisco/lista B (UEFA: Ada Yüzgeç)
- Berat Luş (F) id=1945952 — asterisco/lista B (UEFA: Berat Luş)
- Can Armando Güner (F) id=1861964 — no está en la lista oficial UEFA
- Arda Yılmaz (G) id=1931417 — no está en la lista oficial UEFA
- Eyüp Aydın (M) id=1130115 — no está en la lista oficial UEFA
- İlhami Siraçhan Nas (M) id=1017891 — no está en la lista oficial UEFA

### Solo en UEFA, sin acción (1)

- Aleksei Batrakov (M) — cubierto como \'Aleksey Batrakov' (ver Incluidos/Dudas resueltas)

## Inter (id 2697) — OK usuario

Totales: json 955 → 953 global (equipo: 23 mantener, 2 no en lista, 0 lista B). Fotos borradas: 2.

### Incluidos (23)

- Alessandro Bastoni (D) id=826188
- Benjamin Pavard (D) id=787505
- Carlos Augusto (D) id=929199
- Djed Spence (D) id=945798
- John Stones (D) id=152077
- Manuel Akanji (D) id=383560
- Mattia Marello (D) id=1495720
- Yann Bisseck (D) id=906275
- Ange-Yoan Bonny (F) id=1086223
- Lautaro Martínez (F) id=823984
- Marcus Thuram (F) id=791702
- Ivan Provedel (G) id=308182
- Josep Martínez (G) id=845291
- Raffaele Di Gennaro (G) id=301162
- Andy Diouf (M) id=1048889
- Curtis Jones (M) id=927353
- Federico Dimarco (M) id=284361 [posición UEFA D ≠ json M]
- Hakan Çalhanoğlu (M) id=135700
- Henrikh Mkhitaryan (M) id=37151
- Luís Henrique (M) id=977679 [posición UEFA F ≠ json M]
- Nicolò Barella (M) id=363856
- Petar Sučić (M) id=1091303
- Piotr Zieliński (M) id=138605

### Excluidos (2)

- Pio Esposito (F) id=1156616 — no está en la lista oficial UEFA
- Aleksandar Stanković (M) id=1153957 — no está en la lista oficial UEFA

## LASK (id 2058) — OK usuario

Totales: json 954 → 949 global (equipo: 22 mantener, 5 no en lista, 0 lista B). Fotos borradas: 5.

### Incluidos (22)

- Andrés Andrade (D) id=841802
- Daniel Elfadli (D) id=945532
- Manoël Verhaeghe (D) id=2214471
- Miguel Freckleton (D) id=1435912
- Xavier Mbuyamba (D) id=974020
- Yvan Dibango (D) id=1103553
- Christoph Lang (F) id=1104216 [posición UEFA M ≠ json F]
- Moses Usor (F) id=1215061
- Nael Kane (F) id=2147798
- Samuel Adeniran (F) id=1068299
- Saša Kalajdžić (F) id=870038
- Fabian Schillinger (G) id=1566223
- Lukas Jungwirth (G) id=1031170
- Tobias Schützenauer (G) id=355480
- Alessandro Schöpf (M) id=147776
- Florian Flecker (M) id=787543
- George Bello (M) id=931742 [posición UEFA D ≠ json M]
- Kasper Jørgensen (M) id=978952 [posición UEFA D ≠ json M]
- Krystof Daněk (M) id=1009833
- Melayro Bogarde (M) id=961672
- Robert Ljubičić (M) id=935308
- Sascha Horvath (M) id=282093

### Excluidos (5)

- Alemão (D) id=1199402 — no está en la lista oficial UEFA
- Amin Ibrahim (D) id=1404274 — no está en la lista oficial UEFA
- Cheikne Kebe (D) id=2190878 — no está en la lista oficial UEFA
- Ramiz Harakate (F) id=1397899 — no está en la lista oficial UEFA
- Art Smakaj (M) id=1148949 — no está en la lista oficial UEFA

### Solo en UEFA, sin acción (1)

- Joao Victor Tornich (D) — ⚠️ CASO GRAVE: está en la lista UEFA pero NO existe en Sofascore (ni en plantilla ni en search); imposible añadir (sin id/foto)

## RB Leipzig (id 36360) — OK usuario

Totales: json 949 → 940 global (equipo: 22 mantener, 9 no en lista, 0 lista B). Fotos borradas: 9.

### Incluidos (22)

- Benjamin Henrichs (D) id=319857
- Castello Lukeba (D) id=976421
- David Raum (D) id=856076
- Lukas Klostermann (D) id=319853
- Max Finkgräfe (D) id=1146250
- Maxime Estève (D) id=1117223 [posición UEFA M ≠ json D]
- Ridle Baku (D) id=856553 [posición UEFA M ≠ json D]
- Willi Orbán (D) id=136924
- Christopher Nkunku (F) id=769333 [posición UEFA M ≠ json F]
- Johan Bakayoko (F) id=1088896
- Marc Guiu (F) id=1414933
- Rômulo (F) id=1133743 [variante de 'Rômulo Cardoso']
- Tidiam Gomis (F) id=1426577
- Maarten Vandevoordt (G) id=934385
- Ørjan Nyland (G) id=22209
- Andrija Maksimović (M) id=1406171
- Brajan Gruda (M) id=1198075 [posición UEFA F ≠ json M]
- Christoph Baumgartner (M) id=825956
- Ezechiel Banzuzi (M) id=1155383
- Neil El Aynaoui (M) id=1128530
- Nicolas Seiwald (M) id=976575
- Rocco Reitz (M) id=1048650

### Excluidos (9)

- Abdoul Kone (D) id=1859949 — no está en la lista oficial UEFA
- Antonio Nusa (F) id=1121923 — no está en la lista oficial UEFA
- Samba Konaté (F) id=2269705 — no está en la lista oficial UEFA
- Sani Suleiman (F) id=1894870 — no está en la lista oficial UEFA
- Leopold Zingerle (G) id=148263 — no está en la lista oficial UEFA
- Arthur Vermeeren (M) id=1149127 — no está en la lista oficial UEFA
- Assan Ouédraogo (M) id=1418623 — no está en la lista oficial UEFA
- Benno Kaltefleiter (M) id=1925472 — no está en la lista oficial UEFA
- Viggo Gebel (M) id=1900995 — no está en la lista oficial UEFA

## RC Lens (id 1648) — OK usuario

Totales: json 940 → 936 global (equipo: 25 mantener, 4 no en lista, 0 lista B). Fotos borradas: 4.

### Incluidos (25)

- Ismaelo Ganiou (D) id=1408080
- Jean-Clair Todibo (D) id=945217
- Jonathan Gradit (D) id=369650
- Kyllian Antonio (D) id=1546405
- Nidal Čelik (D) id=1399503
- Samson Baidoo (D) id=1099117
- Souleymane Sagnan (D) id=1545381
- Abdallah Sima (F) id=1029018
- Florian Sotoca (F) id=788921
- Florian Thauvin (F) id=148824
- Franjo Ivanović (F) id=1103333
- Odsonne Édouard (F) id=795228
- Mathieu Gorgelin (G) id=123226
- Robin Risser (G) id=1387161
- Régis Gurtner (G) id=14841
- Amadou Haidara (M) id=822708
- Andrija Bulatović (M) id=1423504
- Junior Kadile (M) id=999033 [posición UEFA F ≠ json M]
- Matthieu Udol (M) id=787827 [posición UEFA D ≠ json M]
- Michaël Cuisance (M) id=826208
- Michał Skóraś (M) id=942479 [posición UEFA D ≠ json M]
- Ruben Aguilar (M) id=579576 [posición UEFA D ≠ json M]
- Saud Abdulhamid (M) id=966849 [posición UEFA D ≠ json M]
- Thorgan Hazard (M) id=94286 [posición UEFA F ≠ json M]
- Yassine Titraoui (M) id=1094538

### Excluidos (4)

- Maik Nawrocki (D) id=984183 — no está en la lista oficial UEFA
- Ilan Jourdren (G) id=1961639 — no está en la lista oficial UEFA
- Jhoanner Chávez (M) id=1002458 — no está en la lista oficial UEFA
- Mezian Mesloub (M) id=2199216 — no está en la lista oficial UEFA

### Solo en UEFA, sin acción (2)

- Yacine Titraoui (M) — cubierto como \'Yassine Titraoui' (ver Incluidos/Dudas resueltas)
- Mickaël Cuisance (M) — cubierto como \'Michaël Cuisance' (ver Incluidos/Dudas resueltas)

## Lille (id 1643) — OK usuario

Totales: json 936 → 930 global (equipo: 23 mantener, 6 no en lista, 0 lista B). Fotos borradas: 6.

### Incluidos (23)

- Alexsandro Ribeiro (D) id=1049775 [variante de 'Alexsandro']
- Calvin Verdonk (D) id=361780
- Isaac Cossier (D) id=1936804
- Loun Srdanovic (D) id=1417059
- Nathan Ngoy (D) id=1119487
- Romain Perraud (D) id=827519
- Tanguy Nianzou (D) id=1003007
- Tiago Santos (D) id=1087364
- Ayase Ueda (F) id=985823
- Olivier Giroud (F) id=39070
- Soriba Diaoune (F) id=1936816
- Berke Özer (G) id=847494
- Orlando Gill (G) id=991709
- Başar Önal (M) id=1193676
- Benjamin André (M) id=51665
- Dilane Bakwa (M) id=963298 [posición UEFA F ≠ json M]
- Ethan Mbappé (M) id=1402698
- Gaëtan Perrin (M) id=827506 [posición UEFA F ≠ json M]
- Hakon Arnar Haraldsson (M) id=1138804
- Maurits Kjaergaard (M) id=987818
- Nabil Bentaleb (M) id=368120
- Ngal'ayel Mukau (M) id=1391541
- Osame Sahraoui (M) id=965357

### Excluidos (6)

- Ousmane Touré (D) id=1513466 — no está en la lista oficial UEFA
- Hamza Igamane (F) id=1140859 — no está en la lista oficial UEFA
- Matah Yondjio (F) id=2427238 — no está en la lista oficial UEFA
- Mohamed Bayo (F) id=909318 — no está en la lista oficial UEFA
- Tiago Morais (F) id=1067284 — no está en la lista oficial UEFA
- Arnaud Bodart (G) id=878898 — no está en la lista oficial UEFA

### Solo en UEFA, sin acción (2)

- Adeagan Goffi (D) — ⚠️ CASO GRAVE: está en la lista UEFA pero NO existe en Sofascore (ni en plantilla ni en search); imposible añadir (sin id/foto)
- Maurits Kjærgaard (M) — cubierto como \'Maurits Kjaergaard' (ver Incluidos/Dudas resueltas)

## Liverpool FC (id 44) — OK usuario

Totales: json 933 → 928 global (equipo: 25 mantener, 5 no en lista, 0 lista B). Fotos borradas: 5.

### Incluidos (25)

- Conor Bradley (D) id=1008402
- Giovanni Leoni (D) id=1473137
- Jeremie Frimpong (D) id=970361
- Joe Gomez (D) id=318927
- Jérémy Jacquet (D) id=1445625
- Kostas Tsimikas (D) id=786259
- Miloš Kerkez (D) id=1097425
- Ronald Araújo (D) id=925097
- Virgil van Dijk (D) id=151545
- Alexander Isak (F) id=823941
- Bradley Barcola (F) id=996952
- Hugo Ekitiké (F) id=1048422
- Víctor Muñoz (F) id=1145642 [posición UEFA M ≠ json F]
- Alisson (G) id=243609 [variante de 'Alisson Becker']
- Freddie Woodman (G) id=284417
- Giorgi Mamardashvili (G) id=930997
- Vítězslav Jaroš (G) id=927359
- Alexis Mac Allister (M) id=895324
- Cody Gakpo (M) id=862967 [posición UEFA F ≠ json M]
- Dominik Szoboszlai (M) id=869856
- Florian Wirtz (M) id=1019322
- Isaac Mabaya (M) id=1148511 [posición UEFA D ≠ json M]
- James McConnell (M) id=1138428
- Luke Chambers (M) id=1134530 [posición UEFA D ≠ json M]
- Ryan Gravenberch (M) id=904897

### Excluidos (5)

- Federico Chiesa (F) id=845386 — no está en la lista oficial UEFA
- Rio Ngumoha (F) id=1881902 — no está en la lista oficial UEFA
- Harvey Davies (G) id=1008403 — no está en la lista oficial UEFA
- Trey Nyoni (M) id=1445945 — no está en la lista oficial UEFA
- Wataru Endo (M) id=143040 — no está en la lista oficial UEFA

## Manchester City (id 17) — OK usuario

Totales: json 929 → 925 global (equipo: 23 mantener, 4 no en lista, 0 lista B). Fotos borradas: 4.

### Incluidos (23)

- Abdukodir Khusanov (D) id=1194333
- Joško Gvardiol (D) id=964994
- Marc Guéhi (D) id=877994
- Matheus Nunes (D) id=945122 [posición UEFA M ≠ json D]
- Rayan Aït-Nouri (D) id=931278
- Rico Lewis (D) id=1136731
- Rúben Dias (D) id=318941
- Vitor Reis (D) id=1485300
- Erling Haaland (F) id=839956
- Gerónimo Rulli (G) id=128383
- Gianluigi Donnarumma (G) id=824509
- Marcus Bettinelli (G) id=257993
- Max-Edgar Chabot (G) id=2245589
- Allan (M) id=1835889 [variante de 'Allan Elias'; posición UEFA F ≠ json M]
- Antoine Semenyo (M) id=934354 [posición UEFA F ≠ json M]
- Ayyoub Bouaddi (M) id=1564180
- Elliot Anderson (M) id=994546
- Enzo Fernández (M) id=974505
- Iliman Ndiaye (M) id=914309 [posición UEFA F ≠ json M]
- Jérémy Doku (M) id=934386
- Mateo Kovačić (M) id=136710
- Phil Foden (M) id=859765
- Rayan Cherki (M) id=979128

### Excluidos (4)

- Josh Wilson-Esbrand (D) id=1017915 — no está en la lista oficial UEFA
- Nico O'Reilly (D) id=1142703 — no está en la lista oficial UEFA
- Claudio Echeverri (M) id=1482424 — no está en la lista oficial UEFA
- Ryan McAidoo (M) id=1826151 — no está en la lista oficial UEFA

## Manchester United (id 35) — OK usuario

Totales: json 925 → 918 global (equipo: 25 mantener, 7 no en lista, 0 lista B). Fotos borradas: 7.

### Incluidos (25)

- Ayden Heaven (D) id=1445799 [posición UEFA M ≠ json D]
- Diogo Dalot (D) id=843200
- Harry Maguire (D) id=149380
- Lisandro Martínez (D) id=859999
- Luke Shaw (D) id=190839
- Matthijs de Ligt (D) id=803031
- Noussair Mazraoui (D) id=847030
- Benjamin Šeško (F) id=986397
- Bryan Mbeumo (F) id=927083
- Joshua Zirkzee (F) id=917007
- Marcus Rashford (F) id=814590
- Matheus Cunha (F) id=886363
- Tynan Thompson (F) id=1899445
- Dermot Mee (G) id=1005664
- Karl Darlow (G) id=123689
- Senne Lammens (G) id=964753
- Tom Heaton (G) id=18122
- Amad Diallo (M) id=971037 [posición UEFA F ≠ json M]
- Andrey Santos (M) id=1105779
- Bruno Fernandes (M) id=288205
- Carlos Baleba (M) id=1199043
- Manuel Ugarte (M) id=846425
- Mason Mount (M) id=836694
- Patrick Dorgu (M) id=1397168 [posición UEFA D ≠ json M]
- Youri Tielemans (M) id=331737

### Excluidos (7)

- Leny Yoro (D) id=1153315 — no está en la lista oficial UEFA
- Fred Heath (G) id=2725912 — no está en la lista oficial UEFA
- Harry Amass (M) id=1461595 — no está en la lista oficial UEFA
- Jack Fletcher (M) id=1402726 — no está en la lista oficial UEFA
- Kobbie Mainoo (M) id=1142175 — no está en la lista oficial UEFA
- Shea Lacey (M) id=1465865 — no está en la lista oficial UEFA
- Tyler Fletcher (M) id=1402850 — no está en la lista oficial UEFA

## SSC Napoli (id 2714) — OK usuario

Totales: json 918 → 914 global (equipo: 23 mantener, 4 no en lista, 0 lista B). Fotos borradas: 4.

### Incluidos (23)

- Amir Rrahmani (D) id=332155
- Benoît Badiashile (D) id=904827
- Giovanni Di Lorenzo (D) id=153257
- Leonardo Spinazzola (D) id=148899
- Mathías Olivera (D) id=805078
- Rafa Marín (D) id=984623
- Sam Beukema (D) id=898815
- Alisson Santos (F) id=1122835
- Antonio Vergara (F) id=1069560
- David Neres (F) id=850993
- Lorenzo Lucca (F) id=962364
- Noa Lang (F) id=875136
- Rasmus Højlund (F) id=1086417
- Alex Meret (G) id=592794
- Nikita Contini (G) id=352728
- Vanja Milinković-Savić (G) id=356160
- Billy Gilmour (M) id=907668
- Costantino Favasuli (M) id=1100544 [posición UEFA D ≠ json M]
- Frank Anguissa (M) id=787941
- Kevin De Bruyne (M) id=70996
- Matteo Politano (M) id=235672 [posición UEFA F ≠ json M]
- Scott McTominay (M) id=879346
- Stanislav Lobotka (M) id=150383

### Excluidos (4)

- Alessandro Buongiorno (D) id=870263 — no está en la lista oficial UEFA
- Luca Marianucci (D) id=1165371 — no está en la lista oficial UEFA
- Dinis Rodrigues (F) id=1158197 — no está en la lista oficial UEFA
- Giovane (F) id=1170773 — no está en la lista oficial UEFA

## Paris Saint-Germain (id 1644) — OK usuario

Totales: json 915 → 915 global (equipo: 24 mantener, 0 no en lista, 0 lista B). Fotos borradas: 0.

### Incluidos (24)

- Achraf Hakimi (D) id=814594
- Ilya Zabarnyi (D) id=1023567
- Lucas Beraldo (D) id=1108441
- Lucas Digne (D) id=96538
- Lucas Hernández (D) id=352370
- Marquinhos (D) id=155995
- Nuno Mendes (D) id=989768
- Willian Pacho (D) id=979480
- Désiré Doué (F) id=1154605
- Ferran Torres (F) id=855833
- Khvicha Kvaratskhelia (F) id=889259
- Mika Godts (F) id=1149146
- Ousmane Dembélé (F) id=818244
- Quentin Ndjantou (F) id=1861665
- Alessandro Longoni (G) id=1823902
- Lucas Chevalier (G) id=996953
- Matvey Safonov (G) id=800749
- Dro Fernández (M) id=1926085
- Fabián Ruiz (M) id=784655
- João Neves (M) id=1190933
- Maghnes Akliouche (M) id=1130939
- Senny Mayulu (M) id=1473491
- Vitinha (M) id=902029
- Warren Zaïre-Emery (M) id=1142672

### Excluidos (0)


### Solo en UEFA, sin acción (2)

- Matvei Safonov (G) — cubierto como \'Matvey Safonov' (ver Incluidos/Dudas resueltas)
- Illia Zabarnyi (D) — cubierto como \'Ilya Zabarnyi' (ver Incluidos/Dudas resueltas)

## FC Porto (id 3002) — OK usuario

Totales: json 915 → 911 global (equipo: 24 mantener, 3 no en lista, 1 lista B). Fotos borradas: 4.

### Incluidos (24)

- Alberto Costa (D) id=1160957
- Francisco Moura (D) id=985138
- Jakub Kiwior (D) id=976037
- Jan Bednarek (D) id=286085
- Nehuén Pérez (D) id=913401
- Souza (D) id=1482340
- Zaidu Sanusi (D) id=987510
- André Silva (F) id=190159
- Borja Sainz (F) id=992567
- Oskar Pietuszewski (F) id=1548929
- Pepê (F) id=882664
- Samu Aghehowa (F) id=1503836 [variante de 'Samu']
- Santiago Giménez (F) id=892141
- William Gomes (F) id=1639250
- Cláudio Ramos (G) id=116372
- Diogo Costa (G) id=843115
- João Afonso (G) id=1961855
- João Costa (G) id=788365
- Alan Varela (M) id=1066560
- Gabri Veiga (M) id=1010505 [variante de 'Gabriel Veiga'; posición UEFA F ≠ json M]
- Hwang In-beom (M) id=889689 [variante de 'Inbeom Hwang']
- Pablo Rosario (M) id=804472
- Seko Fofana (M) id=191188
- Victor Froholdt (M) id=1406639

### Excluidos (4)

- Dominik Prpić (D) id=1146484 — no está en la lista oficial UEFA
- Martim Fernandes (D) id=1142585 — asterisco/lista B (UEFA: Martim Fernandes)
- Gabriel Veron (F) id=1002819 — no está en la lista oficial UEFA
- Vasco Sousa (M) id=1006995 — no está en la lista oficial UEFA

## PSV Eindhoven (id 2952) — OK usuario

Totales: json 911 → 903 global (equipo: 23 mantener, 8 no en lista, 0 lista B). Fotos borradas: 8.

### Incluidos (23)

- Armando Obispo (D) id=825838
- Kiliann Sildillia (D) id=1014222
- Lutsharel Geertruida (D) id=856739
- Mauro Júnior (D) id=893499
- Ryan Flamingo (D) id=1046960
- Sergiño Dest (D) id=906021
- Yarek Gasiorowski (D) id=1184317
- Esmir Bajraktarević (F) id=1136110
- Ricardo Pepi (F) id=986395
- Ruben van Bommel (F) id=1212550
- Sam Lammers (F) id=804901
- Matěj Kovář (G) id=927366
- Nick Olij (G) id=227192
- Alassane Pléa (M) id=192308 [posición UEFA F ≠ json M]
- Ayoni Santos (M) id=1648751
- Dennis Man (M) id=812145 [posición UEFA F ≠ json M]
- Filip Kostić (M) id=126588 [posición UEFA D ≠ json M]
- Guus Til (M) id=845798
- Ivan Perišić (M) id=38710 [posición UEFA F ≠ json M]
- Kodai Sano (M) id=1184054
- Paul Wanner (M) id=1146018
- Sami Ouaissa (M) id=1394147 [posición UEFA F ≠ json M]
- Sven Mijnans (M) id=980671

### Excluidos (8)

- Adamo Nagalo (D) id=1108094 — no está en la lista oficial UEFA
- Fabian Merién (D) id=1886210 — no está en la lista oficial UEFA
- Jerdy Schouten (D) id=844234 — no está en la lista oficial UEFA
- Tijn Smolenaars (G) id=1445965 — no está en la lista oficial UEFA
- Amir Bouhamdi (M) id=2266990 — no está en la lista oficial UEFA
- Isaac Babadi (M) id=1120701 — no está en la lista oficial UEFA
- Joel Van Den Berg (M) id=1540010 — no está en la lista oficial UEFA
- Noah Fernandez (M) id=1886213 — no está en la lista oficial UEFA

## Real Betis (id 2816) — OK usuario

Totales: json 903 → 902 global (equipo: 25 mantener, 1 no en lista, 0 lista B). Fotos borradas: 1.

### Incluidos (25)

- Aitor Ruibal (D) id=893062 [posición UEFA F ≠ json D]
- Angel Ortiz (D) id=1152139
- Diego Llorente (D) id=305278
- Fran García (D) id=851271
- Héctor Bellerín (D) id=188365
- Junior Firpo (D) id=914835
- Marc Bartra (D) id=99519
- Natan (D) id=1015287
- Valentín Gómez (D) id=1186010
- Cucho Hernández (F) id=887055
- Troy Parrott (F) id=966555
- Diego Conde (G) id=951008
- Álvaro Valles (G) id=964983
- Abdessamad Ezzalzouli (M) id=1011375 [variante de 'Abde Ezzalzouli'; posición UEFA F ≠ json M]
- Antony (M) id=958380 [posición UEFA F ≠ json M]
- Dani Ceballos (M) id=547838
- Facundo Bernal (M) id=1177404
- Giovani Lo Celso (M) id=798835
- Iker Losada (M) id=992331
- Isco (M) id=103417
- Marc Roca (M) id=847128
- Nelson Deossa (M) id=1129401
- Pablo Fornals (M) id=816763
- Rodrigo Riquelme (M) id=989113
- Álvaro Fidalgo (M) id=838629

### Excluidos (1)

- Ricardo Funez (M) id=2725906 — no está en la lista oficial UEFA

## Real Madrid (id 2829) — OK usuario

Totales: json 903 → 899 global (equipo: 25 mantener, 2 no en lista, 2 lista B). Fotos borradas: 4.

### Incluidos (25)

- Antonio Rüdiger (D) id=142622
- Dean Huijsen (D) id=1176744
- Ibrahima Konaté (D) id=826215
- Marc Cucurella (D) id=794939
- Raúl Asencio (D) id=1156645
- Trent Alexander-Arnold (D) id=795064
- Álvaro Carreras (D) id=1085081
- Éder Militão (D) id=822519
- Carlos Espí (F) id=1649918
- Endrick (F) id=1174937
- Kylian Mbappé (F) id=826643
- Rodrygo (F) id=910536
- Vinícius Júnior (F) id=868812
- Yan Diomande (F) id=2087085 [posición UEFA M ≠ json F]
- Andriy Lunin (G) id=857574
- Thibaut Courtois (G) id=70988
- Arda Güler (M) id=1091116
- Aurélien Tchouaméni (M) id=859025
- Bernardo Silva (M) id=331209
- Brahim Díaz (M) id=835485 [posición UEFA F ≠ json M]
- Denzel Dumfries (M) id=759520 [posición UEFA D ≠ json M]
- Eduardo Camavinga (M) id=973887
- Federico Valverde (M) id=831808
- Jude Bellingham (M) id=991011
- Sergio Martinez (M) id=2197894

### Excluidos (4)

- Ferland Mendy (D) id=792073 — no está en la lista oficial UEFA
- Diego Lacosta (M) id=2049131 — no está en la lista oficial UEFA
- Jorge Cestero (M) id=1590121 — asterisco/lista B (UEFA: Jorge Cestero)
- Thiago Pitarch (M) id=2237795 — asterisco/lista B (UEFA: Thiago Pitarch)

## AS Roma (id 2702) — OK usuario

Totales: json 900 → 897 global (equipo: 23 mantener, 3 no en lista, 0 lista B). Fotos borradas: 3.

### Incluidos (23)

- Daniele Ghilardi (D) id=1384847
- Evan Ndicka (D) id=848287 [variante de 'Evan N'Dicka']
- Gianluca Mancini (D) id=611210
- Konstantinos Koulierakis (D) id=1184855
- Leonardo Balerdi (D) id=928236
- Mario Hermoso (D) id=353130
- Nahuel Molina (D) id=831799
- Antonio Arena (F) id=1923599
- Donyell Malen (F) id=803039
- Lorenzo Pellegrini (F) id=555540 [posición UEFA M ≠ json F]
- Matías Soulé (F) id=1082406
- Paulo Dybala (F) id=256219
- Santiago Castro (F) id=1116577
- Mile Svilar (G) id=793986
- Pierluigi Gollini (G) id=329175
- Bryan Cristante (M) id=186855
- Devyne Rensch (M) id=982778 [posición UEFA D ≠ json M]
- Emanuele Lulli (M) id=1955992 [posición UEFA D ≠ json M]
- Manu Koné (M) id=974087
- Marten de Roon (M) id=100389
- Niccolò Pisilli (M) id=1175821
- Rodrigo Mora (M) id=1410240 [posición UEFA F ≠ json M]
- Wesley (M) id=1134200 [variante de 'Wesley França'; posición UEFA D ≠ json M]

### Excluidos (3)

- Anass Salah-Eddine (D) id=961684 — no está en la lista oficial UEFA
- Devis Vásquez (G) id=925285 — no está en la lista oficial UEFA
- Giorgio De Marzi (G) id=1652568 — no está en la lista oficial UEFA

## ŠK Slovan Bratislava (id 2404) — OK usuario

Totales: json 897 → 889 global (equipo: 22 mantener, 6 no en lista, 2 lista B). Fotos borradas: 8.

### Incluidos (22)

- César Blackman (D) id=841793
- Kenan Bajrić (D) id=230932
- Kevin Wimmer (D) id=141203
- Sahmkou Camara (D) id=1445153 [traspaso: estaba en nuestro json bajo Slavia Praha, movido a Slovan (misma foto)]
- Samuel Kozlovský (D) id=836687
- Sandro Cruz (D) id=982146
- Svetozar Marković (D) id=890913
- Andraž Šporar (F) id=166987
- Roman Čerepkai (F) id=964166
- Suleiman Camara (F) id=1090128
- Aleksandar Popović (G) id=50313
- Dominik Takáč (G) id=886365
- Matúš Macík (G) id=799087
- Alasana Yirajang (M) id=1804850 [posición UEFA F ≠ json M]
- Alen Mustafić (M) id=927799
- Artur Gajdoš (M) id=1087830
- Cristian Martínez (M) id=841006
- Daiki Matsuoka (M) id=932395
- Danylo Ignatenko (M) id=793995
- Peter Pokorný (M) id=942382
- Rahim Ibrahim (M) id=1109961
- Tigran Barseghyan (M) id=95494

### Excluidos (8)

- Jurij Medveděv (D) id=802156 — no está en la lista oficial UEFA
- Adam Griger (F) id=1048239 — no está en la lista oficial UEFA
- Manasse Kianga (F) id=2539548 — no está en la lista oficial UEFA
- Mykola Kukharevych (F) id=1029969 — no está en la lista oficial UEFA
- Róbert Mak (F) id=87087 — no está en la lista oficial UEFA
- Alexej Maros (M) id=1473118 — asterisco/lista B (UEFA: Alexej Maroš)
- Kelvin Ofori (M) id=991378 — no está en la lista oficial UEFA
- Nino Marcelli (M) id=1397170 — asterisco/lista B (UEFA: Nino Marcelli)

### Solo en UEFA, sin acción (1)

- Danylo Ihnatenko (M) — cubierto como \'Danylo Ignatenko' (ver Incluidos/Dudas resueltas)

## Sabah FK (id 267828) — OK usuario

Totales: json 891 → 885 global (equipo: 24 mantener, 4 no en lista, 2 lista B). Fotos borradas: 6.

### Incluidos (24)

- Aden McCarthy (D) id=1167835
- Akim Zedadka (D) id=558524
- Erivaldo Almeida da Silva (D) id=2353224 [variante de 'Erivaldo Almeida'; añadido manual 2026-09-04: en Sofascore está en Sete FC (fichaje reciente), foto 404 → placeholder]
- Rahman Dashdamirov (D) id=945401
- Steve Solvet (D) id=860168
- Tellur Mutallimov (D) id=812019
- Tymoteusz Puchacz (D) id=867493
- Joy Lance Mickels (F) id=169231
- Khayal Aliyev (F) id=1124027 [posición UEFA M ≠ json F]
- Patrick Orphe M'Bina (F) id=1085179 [variante de 'Orphe Mbina']
- Amin Ramazanov (G) id=1184866
- Stas Pokatilov (G) id=118624
- Abdulakh Khaybulaev (M) id=1156621
- Aleksey Isayev (M) id=1145242
- Cafar Mukhtarov (M) id=2002554 [transliteración de 'Jafar Mukhtarov' (Sabah II); añadido manual 2026-09-04, foto 404 → placeholder]
- Christian Nwachukwu (M) id=1653823 [posición UEFA F ≠ json M]
- Du Queiroz (M) id=1128129
- Ivan Lepinjica (M) id=887799
- Kaheem Parris (M) id=1007881
- Rauf Rustamli (M) id=1005988
- Rodrigo Fernandes (M) id=988347
- Umarali Rakhmonaliev (M) id=1134291
- Veljko Simić (M) id=188117 [posición UEFA F ≠ json M]
- Xander Severina (M) id=1110159 [posición UEFA F ≠ json M]

### Excluidos (6)

- Godfred Boakye (D) id=2235358 — no está en la lista oficial UEFA
- Júnior Almeida (D) id=1046500 — no está en la lista oficial UEFA
- Younes Lachaab (F) id=1939210 — no está en la lista oficial UEFA
- Ravan Mirzammadov (G) id=1606735 — asterisco/lista B (UEFA: Ravan Mirzammadov)
- Shahin Ibrahimov (M) id=1992831 — asterisco/lista B (UEFA: Shahin Ibrahimov)
- Zinédine Ould Khaled (M) id=989899 — no está en la lista oficial UEFA

### Solo en UEFA, sin acción (3)

- Abdulakh Khaibulaev (M) — cubierto como \'Abdulakh Khaybulaev' (ver Incluidos/Dudas resueltas)
- Aleksey Isaev (M) — cubierto como \'Aleksey Isayev' (ver Incluidos/Dudas resueltas)
- Jafar Mukhtarov (M) — cubierto como \'Cafar Mukhtarov' (ver Incluidos/Dudas resueltas)

## Shakhtar Donetsk (id 3313) — OK usuario

Totales: json 885 → 875 global (equipo: 25 mantener, 8 no en lista, 2 lista B). Fotos borradas: 10 (Bruno Braga Ramos restaurado tras resolución: es 'Bruninho').

### Incluidos (25)

- Alaa Ghram (D) id=1011994
- Irakli Azarovi (D) id=979665 [variante de 'Irakli Azarov']
- Marlon (D) id=331853 [como 'Marlon Santos' (misma posición; Marlon Gomes es otro jugador)]
- Mykola Matvienko (D) id=353272 [variante de 'Mykola Matviyenko']
- Oleksandr Karavaiev (D) id=137682
- Pedro Henrique (D) id=1100817
- Valerii Bondar (D) id=904850 [variante de 'Valeriy Bondar']
- Vinícius Tobias (D) id=1067639
- Gabriel Carvalho (F) id=1485218 [posición UEFA M ≠ json F]
- Kauã Elias (F) id=1482841
- Lassina Traoré (F) id=911719
- Luca Meirelles (F) id=1633781
- Dmytro Riznyk (G) id=941669
- Kiril Fesyun (G) id=1002780 [variante de 'Kiril Fesiun']
- Alisson Santana (M) id=1471221
- Bruno Braga Ramos (M) id=2436878
- Dmytro Kryskiv (M) id=904859
- Gleiker Mendoza (M) id=1477498
- Isaque (M) id=1835892
- Lucas Ferreira (M) id=1631907
- Marlon Gomes (M) id=1105833
- Oleg Ocheretko (M) id=997082 [variante de 'Oleh Ocheretko']
- Pedrinho (M) id=874030
- Ryan Roberto (M) id=1883363
- Yehor Nazaryna (M) id=833562

### Excluidos (10)

- Alan Matturro (D) id=1177401 — no está en la lista oficial UEFA
- Viktor Korniienko (D) id=904853 — no está en la lista oficial UEFA
- Eguinaldo (F) id=1390545 — no está en la lista oficial UEFA
- Prosper Obah (F) id=1513676 — no está en la lista oficial UEFA
- Denys Tvardovskyi (G) id=1127399 — no está en la lista oficial UEFA
- Rostyslav Bahlai (G) id=1487399 — asterisco/lista B (UEFA: Rostyslav Bahlai)
- Tymur Puzankov (G) id=988217 — no está en la lista oficial UEFA
- Maryan Shved (M) id=791170 — no está en la lista oficial UEFA
- Newerton Palmares (M) id=1485599 — no está en la lista oficial UEFA
- Viktor Tsukanov (M) id=1403324 — asterisco/lista B (UEFA: Viktor Tsukanov)

## SK Slavia Praha (id 2216) — OK usuario

Totales: json 875 → 868 global (equipo: 25 mantener, 7 no en lista, 0 lista B). Fotos borradas: 7.

### Incluidos (25)

- Ange N'Guessan (D) id=1177441
- David Zima (D) id=963084
- Mikuláš Konečný (D) id=1405472
- Samuel Isife (D) id=2063748 [posición UEFA M ≠ json D]
- Tomáš Holeš (D) id=151440
- Tomáš Vlček (D) id=907174
- Štěpán Chaloupek (D) id=1144329
- Adonija Ouanda (F) id=1517290
- Ivan Schranz (F) id=123179 [posición UEFA M ≠ json F]
- Lukáš Provod (F) id=846122 [posición UEFA M ≠ json F]
- Mojmír Chytil (F) id=826049
- Tomáš Chorý (F) id=188307
- Jakub Markovič (G) id=907172
- Nazar Domchak (G) id=1648295
- Danijel Šturm (M) id=825070
- David Jurásek (M) id=1030711
- David Moses (M) id=1435367
- Elias Pitak (M) id=1405461
- Emmanuel Ayaosi (M) id=1604217
- Michal Sadílek (M) id=825731
- Mubarak Suleiman (M) id=2266016
- Oskar Kubiak (M) id=2185579
- Pavel Kačor (M) id=1608379
- Toumani Diakite (M) id=2063059
- Wiktor Nowak (M) id=1513057

### Excluidos (7)

- Denis Halinský (D) id=1126956 — no está en la lista oficial UEFA
- Hamidou Kante (D) id=1963013 — no está en la lista oficial UEFA
- Igoh Ogbu (D) id=927493 — no está en la lista oficial UEFA
- Jindřich Staněk (G) id=280601 — no está en la lista oficial UEFA
- Ondřej Kolář (G) id=986295 — no está en la lista oficial UEFA
- David Douděra (M) id=891442 — no está en la lista oficial UEFA
- Youssoupha Sanyang (M) id=1923332 — no está en la lista oficial UEFA

## Sporting CP (id 3001) — OK usuario

Totales: json 870 → 864 global (equipo: 25 mantener, 6 no en lista, 0 lista B). Fotos borradas: 6.

### Incluidos (25)

- Eduardo Quaresma (D) id=989841
- Georgios Vagiannidis (D) id=1166952
- Gonçalo Inácio (D) id=1001196
- Ibrahima Ba (D) id=1595506
- Iván Fresneda (D) id=1167818
- Maximiliano Araújo (D) id=929193 [posición UEFA M ≠ json D]
- Zeno Debast (D) id=1126512
- Fotis Ioannidis (F) id=903679
- Luis Javier Suárez (F) id=914213 [variante de 'Luis Suárez']
- Nestory Irankunda (F) id=1144687
- Rodrigo Zalazar (F) id=966575 [posición UEFA M ≠ json F]
- Diego Callai (G) id=1130378
- Kaique (G) id=1167067 [variante de 'Kaique Pereira']
- Rui Silva (G) id=253809
- Geny Catamo (M) id=1001140 [posición UEFA F ≠ json M]
- Issa Doumbia (M) id=1141754
- Jesse Derry (M) id=1550775 [posición UEFA F ≠ json M]
- Luís Guilherme (M) id=1016893 [posición UEFA F ≠ json M]
- Moncef Zekri (M) id=1931586 [posición UEFA D ≠ json M]
- Nuno Santos (M) id=352882 [posición UEFA F ≠ json M]
- Pedro Lima (M) id=1067648
- Rodrigo Rodrigues (M) id=2154588 [posición UEFA F ≠ json M]
- Samuel Justo (M) id=1153077
- Sergi Altimira (M) id=1137814 [posición UEFA D ≠ json M]
- Silas Andersen (M) id=1083407

### Excluidos (6)

- Rodrigo Dias (D) id=1520700 — no está en la lista oficial UEFA
- Flávio Gonçalves (F) id=1937022 — no está en la lista oficial UEFA
- Rafael Nel (F) id=1464415 — no está en la lista oficial UEFA
- João Simões (M) id=1410209 — no está en la lista oficial UEFA
- Salvador Blopa (M) id=1939199 — no está en la lista oficial UEFA
- Sotiris Alexandropoulos (M) id=947477 — no está en la lista oficial UEFA

## VfB Stuttgart (id 2677) — OK usuario

Totales: json 866 → 857 global (equipo: 24 mantener, 6 no en lista, 3 lista B). Fotos borradas: 9.

### Incluidos (24)

- Alexander Groiss (D) id=839842 [variante de 'Alexander Groiß']
- Ameen Al-Dakhil (D) id=1979970
- Dominik Nothnagel (D) id=179265
- Finn Jeltsch (D) id=1418649 [posición UEFA M ≠ json D]
- Jeff Chabot (D) id=863271
- Josha Vagnoman (D) id=906278
- Lorenz Assignon (D) id=1009334
- Luca Jaquez (D) id=1127823
- Maximilian Mittelstädt (D) id=788949
- Ramon Hendriks (D) id=916943
- Deniz Undav (F) id=794298
- Dženan Pejčinović (F) id=1127790
- Ermedin Demirović (F) id=878081 [posición UEFA M ≠ json F]
- Leo Sauer (F) id=1150938 [posición UEFA M ≠ json F]
- Tiago Tomás (F) id=983540
- Fabian Bredlow (G) id=152463
- Marius Funk (G) id=222770
- Angelo Stiller (M) id=901882
- Atakan Karazor (M) id=801030
- Bilal El Khannouss (M) id=1126569
- Chris Führich (M) id=891510
- Grischa Prömel (M) id=253993
- Jamie Leweling (M) id=990201 [posición UEFA F ≠ json M]
- Nikolas Nartey (M) id=861981

### Excluidos (9)

- Dan Zagadou (D) id=826205 — no está en la lista oficial UEFA
- Leonidas Stergiou (D) id=962898 — no está en la lista oficial UEFA
- Jeremy Arevalo (F) id=1464642 — no está en la lista oficial UEFA
- Dennis Seimen (G) id=1195736 — asterisco/lista B (UEFA: Dennis Seimen)
- Stefan Drljača (G) id=930339 — no está en la lista oficial UEFA
- Badredine Bouanani (M) id=1153265 — no está en la lista oficial UEFA
- Ertugrul Yigit (M) id=1961772 — asterisco/lista B (UEFA: Ertugrul Yigit)
- Jarzinho Malanga (M) id=1418665 — asterisco/lista B (UEFA: Jarzinho Malanga)
- Justin Diehl (M) id=1146132 — no está en la lista oficial UEFA

## Viking FK (id 1164) — OK usuario

Totales: json 860 → 854 global (equipo: 25 mantener, 1 no en lista, 5 lista B). Fotos borradas: 6.

### Incluidos (25)

- Anders Baertelsen (D) id=856642
- Essien Bassey (D) id=1511727
- Gianni Stensness (D) id=978815
- Henrik Heggheim (D) id=1031399
- Henrik Sælebakke Falchener (D) id=1022374 [variante de 'Henrik Falchener']
- Herman Johan Haugen (D) id=1034970 [variante de 'Herman Haugen']
- Jesper Daland (D) id=958915
- Kristoffer Haugen (D) id=149740
- Martin Ove Roseth (D) id=795113
- Sondre Flem Bjørshol (D) id=845378 [variante de 'Sondre Bjørshol']
- Viljar Vevatne (D) id=325659
- Erik Botheim (F) id=844292
- Nick D'Agostino (F) id=791963
- Peter Christiansen (F) id=946393
- Romano Postema (F) id=992569
- Veton Berisha (F) id=136171
- Arild Østbø (G) id=35769
- Erlend Jacobsen (G) id=878569
- Ľubomír Belko (G) id=964146
- Amin Cosic (M) id=1858049
- Henrik Bjørdal (M) id=326393
- Joe Bell (M) id=822749
- Kristoffer Askildsen (M) id=954855
- Simen Kvia-Egeskog (M) id=1126541 [posición UEFA F ≠ json M]
- Zlatko Tripić (M) id=163569

### Excluidos (6)

- Vetle Auklend (D) id=1613802 — asterisco/lista B (UEFA: Vetle Auklend)
- Kelvin Frimpong (F) id=2461964 — no está en la lista oficial UEFA
- Jakob Segadal Hansen (M) id=1656409 — asterisco/lista B (UEFA: Jakob Hansen) [match por variante de nombre]
- Niklas Kemp Fuglestad (M) id=1870893 — asterisco/lista B (UEFA: Niklas Fuglestad) [match por variante de nombre]
- Ola Visted (M) id=1486451 — asterisco/lista B (UEFA: Ola Visted)
- Tobias Moi (M) id=1840385 — asterisco/lista B (UEFA: Tobias Moi)

## Villarreal (id 2819) — OK usuario

Totales: json 855 → 854 global (equipo: 25 mantener, 1 no en lista, 0 lista B). Fotos borradas: 1.

### Incluidos (25)

- Nizar El Jmili Ben Hamou (None) id=2725909 [variante de 'Nizar El Jmili']
- Alexander Freeman (D) id=1184541 [variante de 'Alex Freeman']
- Carlos Romero (D) id=1396048
- Juan Foyth (D) id=873189
- Logan Costa (D) id=911853
- Pau Navarro (D) id=1525863
- Renato Veiga (D) id=1087359
- Santiago Mouriño (D) id=1468046
- Sergi Cardona (D) id=986245
- Ayoze Pérez (F) id=345195
- Georges Mikautadze (F) id=1009372
- Gerard Moreno (F) id=146866
- Nicolas Pépé (F) id=593526
- Tani Oluwaseyi (F) id=1172477 [posición UEFA M ≠ json F]
- Luiz Júnior (G) id=1066603
- Péter Gulácsi (G) id=37096
- Rubén Gómez (G) id=1407702
- Yakiv Kinareikin (G) id=1400079
- Alberto Moleiro (M) id=1012444
- Carlos Maciá (M) id=2238900
- Ilias Akhomach (M) id=1089108 [posición UEFA F ≠ json M]
- Nathan-Dylan Saliba (M) id=1093229 [variante de 'Nathan Saliba']
- Pape Gueye (M) id=879694
- Santi Comesaña (M) id=843678
- Tajon Buchanan (M) id=973290 [posición UEFA F ≠ json M]

### Excluidos (1)

- Alassane Diatta (M) id=1893907 — no está en la lista oficial UEFA

