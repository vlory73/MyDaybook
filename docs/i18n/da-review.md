# Danish review (da.ts)

Review of all 1483 Danish strings against `en.ts`. 153 strings changed; keys and placeholders are unchanged, `consent.v1.*` is untouched. Orthography rule used throughout: imperatives ending in -ere keep the accent (Redigér, Kopiér, Markér, Registrér, Annullér, Arkivér).

## Changed strings

| Key | Old Danish | New Danish | Reason |
| --- | --- | --- | --- |
| `meds.often.everyN` | Hver par dage | Hver få dage | "Hver par dage" is ungrammatical |
| `meds.reminders.hint` | Sendes som en neutral notifikation på disse tidspunkter, på de enheder hvor du har slået påmindelser til under Mig. Medicin, der tages hver få dage eller kun ved behov, får ingen. | Sendes som en neutral notifikation på disse tidspunkter, på de enheder, hvor du har slået påmindelser til under Mig. Medicin, der tages hver få dage eller kun ved behov, får ingen. | Missing comma before "hvor" |
| `me.about.notMedical` | Den er ikke medicinsk udstyr. Den giver ingen råd, ingen diagnoser, ingen dosisberegninger og ingen advarsler ud fra dine værdier. Tal med en læge eller et apotek om alt, der bekymrer dig. | Den er ikke medicinsk udstyr. Den giver ingen råd, ingen diagnoser, ingen dosisberegninger og ingen advarsler ud fra dine værdier. Tal med din læge eller dit apotek om alt, der bekymrer dig. | "din læge/dit apotek" is warmer than "en læge/et apotek" |
| `cat.gut` | Toilet | Afføring | "Toilet" is vague (could mean urination); matches the medical term |
| `join.welcome.key` | Du får en gendannelsesnøgle, som er den eneste ekstranøgle til din dagbog. Vi hjælper dig med at passe på den. | Du får en gendannelsesnøgle, som er den eneste reservenøgle til din dagbog. Vi hjælper dig med at passe på den. | "reservenøgle" is the natural word (not "ekstranøgle") |
| `recoveryKey.lead` | Det er den eneste ekstranøgle til din dagbog. Opbevar den et sikkert sted uden for telefonen, for eksempel udskrevet i en skuffe eller i en adgangskodeadministrator. | Det er den eneste reservenøgle til din dagbog. Opbevar den et sikkert sted uden for telefonen, for eksempel udskrevet i en skuffe eller i en adgangskodeadministrator. | "reservenøgle" for consistency |
| `recoveryKey.warning.body` | Hvis du mister både din adgangssætning og denne nøgle, er dine notater væk for altid, og den, der driver serveren, kan heller ikke få dem tilbage. | Hvis du mister både din adgangssætning og denne nøgle, er dine registreringer væk for altid, og den, der driver serveren, kan heller ikke få dem tilbage. | Entry word |
| `recoveryKey.print.how` | Sådan bruger du den: Åbn {app}, vælg "Glemt din adgangssætning?" på log ind-skærmen, og skriv denne nøgle. | Sådan bruger du den: Åbn {app}, vælg "Glemt din adgangssætning?" på siden, hvor du logger ind, og skriv denne nøgle. | "log ind-skærmen" reads badly |
| `login.flash.sessionEnded` | Din log ind er udløbet, for eksempel fordi adgangssætningen blev ændret. Log ind igen. | Du er blevet logget ud, for eksempel fordi adgangssætningen blev ændret. Log ind igen. | "Din log ind er udløbet" is not idiomatic |
| `recover.finishing` | Gør klar… | Afslutter… | "Gør klar" means "getting ready", not "finishing" |
| `me.reminders.lead` | Et diskret skub på tidspunkterne for den medicin, hvor påmindelser er slået til. Den sendes også, selvom du allerede har noteret dosen. | En diskret påmindelse på tidspunkterne for den medicin, hvor påmindelser er slået til. Den sendes også, selv om du allerede har noteret dosen. | "skub" is odd; "selv om" is the standard spelling |
| `me.name.lead` | Bruges i hilsenen på I dag og til at udfylde navnet på rapporter. Det forbliver krypteret, ligesom dine noter. | Bruges i hilsenen på I dag og til at udfylde navnet på rapporter. Det forbliver krypteret, ligesom dine registreringer. | Entry word |
| `me.name.empty` | Intet navn angivet. Hilsenen bruger dit loginnavn. | Intet navn angivet. Hilsenen bruger dit brugernavn. | "loginnavn" -> "brugernavn" (same word as everywhere else) |
| `me.name.edit` | Rediger navn | Redigér navn | Consistent imperative spelling (Redigér) |
| `me.passphrase.lead` | Dine notater forbliver, som de er. Dine andre enheder bliver logget ud. | Dine registreringer er uændrede. Dine andre enheder bliver logget ud. | "notater" -> "registreringer" (the app's word for entries) |
| `me.totp.lead` | Tilføjer en kode fra en godkendelsesapp, når du logger ind. Det beskytter kun selve login; din adgangssætning åbner stadig din dagbog. | Tilføjer en kode fra en godkendelsesapp, når du logger ind. Det beskytter kun selve indlogningen; din adgangssætning åbner stadig din dagbog. | "selve login" is clumsy |
| `me.totp.recoveryNote` | Hvis du bruger din gendannelsesnøgle for at komme ind igen, slås totrins-login fra. | Hvis du bruger din gendannelsesnøgle til at komme ind igen, slås totrins-login fra. | "for at" -> "til at" |
| `admin.dependent` | Profil for en pårørende | Pårørendeprofil | Same term as above, shorter |
| `admin.storage` | Plads {size} | Lagerplads {size} | "Plads" alone is vague |
| `admin.delete.lead` | Det sletter {name}s konto og alt i dagbogen for altid. Det kan ikke fortrydes. | Det sletter kontoen for {name} og alt i dagbogen for altid. Det kan ikke fortrydes. | "{name}s" breaks when a name ends in s |
| `me.danger.lastGuardian` | Du er den eneste værge for en afhængig profil. Tilføj en anden værge eller fjern profilen først. | Du er den eneste værge for en pårørendeprofil. Tilføj en anden værge eller fjern profilen først. | One word for dependent profiles (pårørendeprofil) |
| `meal.drink` | Drikkevare | Drikke | Same word as the Drink tile |
| `fmt.bowel.title` | Toiletbesøg | Afføring | Plain medical word, same as the tile |
| `bowel.flag.urgent` | Hastende | Akut trang | "Hastende" is not used about the bowel |
| `bowel.flag.straining` | Presning | Måtte presse | "Presning" is stiff |
| `bowel.flag.notFinished` | Ikke færdig | Ikke helt tømt | Clearer than "Ikke færdig" |
| `bowel.flag.blood` | Blod set | Så blod | "Blod set" is ungrammatical |
| `note.title.edit` | Rediger note | Redigér note | Consistent spelling |
| `note.restored` | Noten er genoprettet | Noten er gendannet | "gendannet" is used everywhere else |
| `feeling.energy.low` | Drænet | Uden energi | "Drænet" is slang |
| `feeling.tags` | Lægger du mærke til noget? | Er der noget, du lægger mærke til? | More natural word order |
| `sleep.problem.range` | Du skal vågne efter, du er faldet i søvn, inden for et døgn. | Du skal vågne senere, end du faldt i søvn, og højst et døgn efter. | Clumsy and ungrammatical original |
| `sleep.kind` | Slags søvn | Type søvn | "Slags søvn" is odd as a label |
| `measure.ctx.morning` | Morgen | Om morgenen | "Morgen" alone reads as the noun |
| `bowel.type.7` | Vandet | Vandig | "Vandet" is not the usual adjective |
| `meal.watch` | Din overvågningsliste | Din holdøje-liste | "Overvågningsliste" sounds like surveillance; matches "det holder jeg øje med" |
| `meal.watch.setup` | Opret din overvågningsliste | Lav din holdøje-liste | Same reason; plainer verb |
| `watch.custom` | Noget andet, du holder øje med | Noget andet | Placeholder was cut off in the input on a phone |
| `dose.taken.aria` | Marker {name} som taget | Markér {name} som taget | Consistent accent on -ér imperatives |
| `dose.late` | Taget forsinket | Taget for sent | One wording for "late" everywhere |
| `dose.pill.late` | Forsinket · {time} | For sent · {time} | Same |
| `adhoc.open` | Log en anden medicin | Registrér anden medicin | "Log en anden medicin" is English-sounding |
| `adhoc.toast` | Dosis logget | Dosis noteret | "logget" is English-sounding |
| `fmt.dose.late` | {name} · Taget forsinket kl. {time} | {name} · Taget for sent kl. {time} | Same |
| `drink.edit` | Rediger | Redigér | Consistent spelling |
| `drink.edit.title` | Drikke og størrelser | Drikkevarer og størrelser | Plural "Drikke" is awkward |
| `drink.edit.drinks` | Drikke | Drikkevarer | Same |
| `drink.edit.newDrink` | ny drik | ny drikkevare | "drik" is not a Danish word |
| `drink.edit.addDrink` | Tilføj en drik | Tilføj en drikkevare | "drik" is not a Danish word |
| `drink.edit.invalid` | Giv alle drikke og størrelser et navn, og alle størrelser en mængde i cl (for eksempel 25 eller 2,5). | Giv alle drikkevarer og størrelser et navn, og alle størrelser en mængde i cl (for eksempel 25 eller 2,5). | Wording follows "drikkevarer" |
| `drink.edit.saved` | Drikke og størrelser gemt | Drikkevarer og størrelser gemt | Wording follows "drikkevarer" |
| `bodymap.region.upper_belly.left` | Din venstre øvre mave | Din venstre overmave | "øvre mave" is clumsy; "overmave" is the real word |
| `bodymap.region.upper_belly.right` | Din højre øvre mave | Din højre overmave | Same |
| `bodymap.region.lower_belly.left` | Din venstre nedre mave | Din venstre undermave | Same |
| `bodymap.region.lower_belly.right` | Din højre nedre mave | Din højre undermave | Same |
| `bodymap.region.mid_back` | Midterste ryg | Midt på ryggen | Natural phrase |
| `bodymap.region.chest.left` | Venstre side af brystkassen | Venstre side af brystet | Simpler than "brystkassen" |
| `bodymap.region.chest.right` | Højre side af brystkassen | Højre side af brystet | Same |
| `bodymap.region.upper_belly` | Øvre mave | Overmave | Real word |
| `bodymap.region.lower_belly` | Nedre mave | Undermave | Real word |
| `bodymap.region.second_toe.right` | Din højre anden tå | Din højre tå nr. 2 | "din højre anden tå" is ungrammatical; numbered toe is clear |
| `bodymap.region.second_toe.left` | Din venstre anden tå | Din venstre tå nr. 2 | "din højre anden tå" is ungrammatical; numbered toe is clear |
| `bodymap.region.third_toe.right` | Din højre tredje tå | Din højre tå nr. 3 | "din højre anden tå" is ungrammatical; numbered toe is clear |
| `bodymap.region.third_toe.left` | Din venstre tredje tå | Din venstre tå nr. 3 | "din højre anden tå" is ungrammatical; numbered toe is clear |
| `bodymap.region.fourth_toe.right` | Din højre fjerde tå | Din højre tå nr. 4 | "din højre anden tå" is ungrammatical; numbered toe is clear |
| `bodymap.region.fourth_toe.left` | Din venstre fjerde tå | Din venstre tå nr. 4 | "din højre anden tå" is ungrammatical; numbered toe is clear |
| `bodymap.region.arch.right` | Hvælvingen på din højre fod | Fodbuen på din højre fod | "Hvælving" is anatomical jargon; "fodbue" is the everyday word |
| `bodymap.region.arch.left` | Hvælvingen på din venstre fod | Fodbuen på din venstre fod | "Hvælving" is anatomical jargon; "fodbue" is the everyday word |
| `dr.place.upper_belly.left` | Venstre øvre mave | Venstre overmave | "overmave" is the real word |
| `dr.place.upper_belly.right` | Højre øvre mave | Højre overmave | "overmave" is the real word |
| `dr.place.lower_belly.left` | Venstre nedre mave | Venstre undermave | "undermave" is the real word |
| `dr.place.lower_belly.right` | Højre nedre mave | Højre undermave | "undermave" is the real word |
| `dr.place.mid_back` | Midterste ryg | Midt på ryggen | Natural phrase |
| `dr.place.chest.left` | Venstre side af brystkassen | Venstre side af brystet | Same wording as the app |
| `dr.place.chest.right` | Højre side af brystkassen | Højre side af brystet | Same wording as the app |
| `dr.place.upper_belly` | Øvre mave | Overmave | Real word |
| `dr.place.lower_belly` | Nedre mave | Undermave | Real word |
| `dr.place.second_toe.right` | Højre anden tå | Højre tå nr. 2 | Same, for the report |
| `dr.place.second_toe.left` | Venstre anden tå | Venstre tå nr. 2 | Same, for the report |
| `dr.place.third_toe.right` | Højre tredje tå | Højre tå nr. 3 | Same, for the report |
| `dr.place.third_toe.left` | Venstre tredje tå | Venstre tå nr. 3 | Same, for the report |
| `dr.place.fourth_toe.right` | Højre fjerde tå | Højre tå nr. 4 | Same, for the report |
| `dr.place.fourth_toe.left` | Venstre fjerde tå | Venstre tå nr. 4 | Same, for the report |
| `dr.place.arch.right` | Hvælvingen på højre fod | Fodbuen på højre fod | Same |
| `dr.place.arch.left` | Hvælvingen på venstre fod | Fodbuen på venstre fod | Same |
| `bodymap.zoom.label` | Tæt på | Nærbillede | "Tæt på" is vague |
| `bodymap.zoom.head.aria` | Hoved, tæt på | Hoved, nærbillede | Follows zoom.label |
| `bodymap.zoom.hand.aria` | Hænder, tæt på | Hænder, nærbillede | Follows zoom.label |
| `bodymap.zoom.foot.aria` | Fødder, tæt på | Fødder, nærbillede | Follows zoom.label |
| `bodymap.wide.upper_belly` | Øvre mave | Overmave | Real word |
| `bodymap.wide.lower_belly` | Nedre mave | Undermave | Real word |
| `bodymap.quality.throbbing` | Dunkende | Pulserende | Same word as the headache report ("pulserende") so the link is clear |
| `bodymap.zone.moderate` | middel | moderat | "middel" is not an adjective on its own; "moderat" is what Danish forms use |
| `headache.order` | Stoppede er før startede. | Hovedpinen kan ikke stoppe, før den er begyndt. | "Stoppede er før startede" is not understandable |
| `headache.started` | Startede | Begyndt | Label, matches the report row |
| `headache.stopped` | Stoppede | Stoppet | Label, matches the report row |
| `headache.stopped.hint` | Lad feltet stå tomt, mens den stadig varer ved. Du bliver spurgt senere. | Lad feltet stå tomt, mens hovedpinen stadig varer ved. Du bliver spurgt senere under I dag. | "den" was unclear; says where the question comes |
| `headache.card.when` | {time} {day} | kl. {time} {day} | Read "Siden 15 for 2 dage siden" on Today; needs "kl." |
| `headache.before.feeling` | Følelsen (fx prikken, følelsesløshed) | Følelsen (fx prikken eller følelsesløshed) | Smoother wording |
| `headache.light` | Lysfølsom? | Lysfølsomhed? | Established term from the paper form |
| `headache.sound` | Lydfølsom? | Lydfølsomhed? | Established term from the paper form |
| `headache.nausea.moderate` | middel | moderat | Same |
| `episode.unlink` | Fjern alle | Frakobl alle | "Fjern alle" could mean deleting the entries |
| `trends.period.custom` | Valgfri | Egen periode | "Valgfri" means "optional" in Danish |
| `trends.feel.title` | Følelse | Trivsel | Card shows mood, energy and stress together |
| `trends.sleep.quality.summary` | Hovedsøvn ved hver kvalitet | Hovedsøvn fordelt på kvalitet | Clearer |
| `trends.bowel.title` | Mave | Afføring | Same word as the tile |
| `trends.bowel.sub_one` | {count} toiletbesøg · Bristol-type 1 til 7, én prik pr. besøg | {count} gang · Bristol-type 1 til 7, én prik pr. gang | "toiletbesøg" could mean urinating |
| `trends.bowel.sub_other` | {count} toiletbesøg · Bristol-type 1 til 7, én prik pr. besøg | {count} gange · Bristol-type 1 til 7, én prik pr. gang | Same |
| `trends.bowel.aria` | Prikker for Bristol-typen ved hvert toiletbesøg, {range}. | Prikker for Bristol-typen ved hver afføring, {range}. | Same |
| `trends.heat.what.hand` | Hånd, tæt på | Hånd, nærbillede | Same word as the Pain sheet |
| `trends.heat.what.foot` | Fod, tæt på | Fod, nærbillede | Same |
| `trends.meals.item` | Punkt på overvågningslisten | Punkt på din holdøje-liste | Follows the watch-list rename |
| `trends.meals.unsure` | Usikker | Ikke sikker | Same as the Yes/No/Not sure pills |
| `trends.meals.bowel` | Mave, type {n} | Afføring, type {n} | Same word as the tile |
| `reports.period.custom` | Valgfri fra–til | Egen periode | Same |
| `rep.row.light` | Lysfølsom | Lysfølsomhed | Established term from the paper form |
| `rep.row.sound` | Lydfølsom | Lydfølsomhed | Established term from the paper form |
| `rep.f.light` | Lysfølsom: | Lysfølsomhed: | Established term from the paper form |
| `rep.f.sound` | Lydfølsom: | Lydfølsomhed: | Established term from the paper form |
| `rep.f.time` | Tid | Kl. | "Tid" is vague; fits the narrow column |
| `rep.fn.severity` | * Sværhedsgraden er beregnet ud fra de smerteintensiteter, der er noteret den dag (gennemsnit af hovedpunkter): 1–3 let, 4–6 moderat, 7–10 svær. | * Dagens sværhedsgrad: gennemsnit af de hovedsmerter, der er noteret den dag: 1–3 let, 4–6 moderat, 7–10 svær. | "hovedpunkter" was wrong; shorter |
| `rep.fn.severityForm` | * Sværhedsgrad: gennemsnit af de hovedsmerteintensiteter (0–10), der er noteret den dag: 1–3 let, 4–6 moderat, 7–10 svær. | * Sværhedsgrad: gennemsnit af de noterede hovedsmerter (0–10) den dag: 1–3 let, 4–6 moderat, 7–10 svær. | Smoother |
| `rep.fn.nausea` | ** Kvalme kommer fra kvalmenoteringer (1–2 let, 3 moderat, 4–5 svær). | ** Kvalme stammer fra registreringer af kvalme (1–2 let, 3 moderat, 4–5 svær). | "kvalmenoteringer" is not a normal word |
| `rep.fn.nauseaForm` | ** Kvalme fra kvalmenoteringer: 1–2 let, 3 moderat, 4–5 svær. | ** Kvalme fra registreringer af kvalme: 1–2 let, 3 moderat, 4–5 svær. | Same |
| `rep.fn.medicine` | Medicin: kun medicin taget efter behov eller én gang; fast medicin er ikke med. | Medicin: kun medicin taget ved behov eller som enkeltdosis; fast medicin er ikke med. | "ved behov" is the app's term |
| `rep.fn.disclaimer` | Lavet ud fra personens egne dagbogsnotater. Den stiller ikke diagnoser. | Lavet ud fra personens egne registreringer i dagbogen. Den stiller ingen diagnoser. | Entry word and grammar |
| `reports.headache.sub` | Dag for dag-skema om hovedpine til din læge, på dansk eller engelsk | Skema over hovedpine dag for dag til din læge, på dansk eller engelsk | Awkward "Dag for dag-skema" |
| `reports.privacy` | Rapporter laves på denne enhed ud fra dine egne notater. Intet sendes nogen steder hen. | Rapporter laves på denne enhed ud fra dine egne registreringer. Intet sendes nogen steder hen. | "notater" means Notes; entries are "registreringer" |
| `reports.n.entries_one` | {count} notat | {count} registrering | Same |
| `reports.n.entries_other` | {count} notater | {count} registreringer | Same |
| `dr.col.late` | Sent | For sent | "Sent" alone is ambiguous |
| `dr.entries_one` | {count} notat | {count} registrering | Same |
| `dr.entries_other` | {count} notater | {count} registreringer | Same |
| `dr.fn.pain` | {entries} på {days}. Gns. er den gennemsnitlige styrke på skalaen fra 0 til 10 (0 ingen, 10 værst tænkelig). Større områder tæller med for hver af deres dele. | {entries} på {days}. Gns. er den gennemsnitlige styrke på skalaen fra 0 til 10 (0 ingen, 10 værst tænkelige). Større områder tæller med for hver af deres dele. | Same wording as the Pain sheet |
| `dr.gut_one` | notat om kvalme eller halsbrand på {days} | registrering af kvalme eller halsbrand på {days} | Entry word |
| `dr.gut_other` | notater om kvalme eller halsbrand på {days} | registreringer af kvalme eller halsbrand på {days} | Entry word |
| `dr.fn.charts` | Kurver og tal viser kun dine egne notater. Dage uden notater er tomme og tælles ikke som nul. | Kurver og tal viser kun dine egne registreringer. Dage uden registreringer er tomme og tælles ikke som nul. | Entry word |
| `dr.footer` | Personlig journal ført af patienten med {app}. Ikke en lægelig vurdering. | Personlige optegnelser ført af patienten i {app}. Ikke en lægelig vurdering. | "journal" means the official patient record |
| `export.inside.heading` | Det er med | Det følger med | "Det er med" is not natural |
| `export.inside.csv` | En CSV-tabel for hver slags notat (måltider, søvn, medicin, smerter …) | En CSV-tabel for hver slags registrering (måltider, søvn, medicin, smerter …) | Entry word |
| `export.inside.readme` | En kort læsmig-fil | En kort læs-mig-fil | Hyphenated compound |
| `export.prepare` | Klargør download | Gør klar til download | "Klargør download" is stiff |
| `export.readme.inside` | Det er med: | Det følger med: | Same |
| `export.readme.json` | alt i én fil som JSON (hvert notat og hver indstilling med id og tidspunkter). | alt i én fil som JSON (hver registrering og hver indstilling med id og tidspunkter). | Entry word |
| `export.readme.csv` | En CSV-tabel for hver slags notat, til at åbne i et regneark: | En CSV-tabel for hver slags registrering, til at åbne i et regneark: | Entry word |
| `export.readme.csvNotes` | Kolonnenavne er på engelsk. Lister er adskilt med "; ". Tidspunkter er lokal tid med forskel til UTC. Et smertenotat har én række for hvert punkt. | Kolonnenavne er på engelsk. Lister er adskilt med "; ". Tidspunkter er lokal tid med forskel til UTC. En smerteregistrering har én række for hvert punkt. | Entry word |
| `consent.v2.p2` | Ud over dine krypterede notater gemmer serveren kun det, der skal til for at drive din konto: dit brugernavn, hvornår du blev oprettet og sidst loggede ind, og en registrering af dette samtykke. | Ud over dine krypterede notater gemmer serveren kun det, der skal til for at drive din konto: dit brugernavn, hvornår du blev oprettet og sidst loggede ind, og en optegnelse over dette samtykke. | "en registrering" would be confused with a diary entry (v2 is unreleased) |
| `privacy.kept.entries` | Dine notater og fotos, gøres uforståelige, så kun du kan åbne dem. | Dine registreringer og fotos. De gøres uforståelige, så kun du kan åbne dem. | Comma splice and entry word |
| `privacy.keep.ip` | Internetadresser, noteret når du opretter dig, eller et login går galt | Internetadresser, som noteres, når du opretter dig, eller når et login går galt | Missing commas |
| `privacy.rights.editHint` | Åbn notatet og ret det. Du behøver ikke at bede om det. | Åbn registreringen og ret den. Du behøver ikke at bede om det. | Entry word |
| `privacy.rights.complain` | Klag | Sådan klager du | "Klag" reads as an order |
| `privacy.know.medical` | {app} er en dagbog, ikke et medicinsk udstyr. Den giver ingen råd og ingen diagnoser. | {app} er en dagbog, ikke medicinsk udstyr. Den giver ingen råd og ingen diagnoser. | Wrong article |

## Unsure

Strings where the new wording is a judgement call. Alternatives in brackets.

- `meal.watch`, `meal.watch.setup`, `trends.meals.item`: "holdøje-liste" (watch list). Informal, but friendlier than "overvågningsliste". [Alternatives: "Min kostliste", "Min observationsliste".]
- `sleep.kind.main` "Hovedsøvn" (Main sleep): a bit stiff, chosen because "Nat" was rejected for night-shift workers. [Alternatives: "Den lange søvn", "Almindelig søvn".]
- `bodymap.quality.throbbing` "Pulserende" (was "Dunkende"): matches the paper form and the report. "Dunkende" is just as common in speech.
- `bodymap.zone.moderate`, `headache.nausea.moderate`: "moderat" (was "middel"). Doctors use "moderat"; "middelsvær" would be more everyday but is longer.
- `admin.dependent`, `me.danger.lastGuardian`: "pårørendeprofil" for dependent profile. The feature is parked; "barneprofil" is wrong for adults in care. [Alternative: "profil for en person, du passer".]
- `bodymap.region.*buttock*` "balle": everyday but a little blunt. [Alternative: "sæde", "sædemuskel".]
- `bodymap.region.*undermave`/`overmave`: real words, but some people say "øverste/nederste del af maven".
- `bodymap.region.arch.*` "Fodbuen": check with a family member that this is understood. [Alternative: "Fodhvælvingen".]
- `bodymap.region.*_toe` "tå nr. 2/3/4": clear, but not how people talk. [Alternative: "anden tå" without the side, e.g. "Den anden tå på din højre fod".]
- `nav.trends` "Udvikling": reads fine; "Overblik" is a possible alternative, but it is also used for the doctor report ("Overblik til lægebesøg").
- `trends.feel.title` "Trivsel" (was "Følelse"): covers mood, energy and stress together.
- `cat.feel` "Humør": the tile also holds energy and stress; "Hvordan har jeg det" is too long for a tile.
- `bowel.flag.notFinished` "Ikke helt tømt", `bowel.flag.urgent` "Akut trang": plain, but check they are the words people would choose.
- `rep.row.trigger` / `headache.trigger` "Mulig udløser": the paper form says "udløsende faktor"; shorter here to fit the column.
- `privacy.know.keyBold` and other privacy texts: unchanged apart from commas; a lawyer or the Datatilsynet wording could replace "samtykke" phrases later.
- "Notater" is now used only for the Notes feature (`reports.sec.notes`, `dr.notes`). A diary entry is "registrering". The frozen consent texts still say "notater" for entries; this was left as is.

## Possible overflow

Checked in the Danish screenshots (375 px wide). Nothing was clipped except the one fixed below.

- `watch.custom` (input placeholder on Me, was "Noget andet, du holder øje med"): was cut off. Fixed by shortening to "Noget andet".
- `trends.period.custom` "Egen periode" in the Trends period switch: wraps onto two lines (does not clip). Shorter option: "Egen".
- `cat.stomach` "Kvalme / halsbrand" on the quick-log tile: wraps to two lines, same as English.
- `dr.col.skipped` "Sprunget over" in the doctor report table: wraps to two lines in the narrow column.
- `bodymap.region.*overmave/undermave` in the heat map list: "Din venstre overmave" wraps to two lines.
- Tab bar: "Udvikling" (9 characters) fits at 375 px; longest label of the five.
- `headache.card.when` is now "kl. {time} {day}" (reads "Siden kl. 15 for 2 dage siden").
- Not checked on screen (no screenshot): `meds.reminders.hint`, `export.*`, admin screens. Long sentences only, so they wrap.
