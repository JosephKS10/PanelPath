# PanelPath demo video (2 minutes)

About 290 spoken words, at roughly 145 words a minute. Record the browser at 1366×768 with the map at year 2026 and the `AU_RES` scenario. Every number below comes from `web/public/data/` or a cited source in the README.

| Time | On screen | Voice-over |
|---|---|---|
| 0:00–0:15 | **Hook.** The map at 2026, all of Australia. | "Over four million Australian homes have rooftop solar. The panels coming off them are, by one recycler's estimate, about eight years old, and the national collection pilot has been frozen since May. We built the map whoever restarts it needs." |
| 0:15–0:35 | **Problem and users.** Hold on the map, then point at the national tonnes card. | "About a million tonnes of panels are due by 2035, and only about seventeen per cent are recycled. Recycling costs twenty-eight dollars a panel against four-fifty for landfill, so where you collect decides whether it happens at all. PanelPath is for the pilot administrator, state regulators and councils." |
| 0:35–1:20 | **Live demo.** (1) Press ▶ and let the years run 2026 to 2035. (2) Type 2765 in the search box and press Enter. (3) Scroll the panel to the urban mine card. (4) Close the panel and click a large orange pin. | "This is panel waste per square kilometre, postcode by postcode, built from Clean Energy Regulator data on four and a half million systems. Press play and the 2011 install boom turns into a waste wave across the suburbs. Type a postcode, say 2765 in Sydney's north-west, and you get its retirements by year, its nearest collection site and its rooftop urban mine: silver is 0.05 per cent of the mass but 47 per cent of the value. The orange pins are 100 collection sites, chosen from 2,488 transfer stations, tips and e-waste drop-offs, at least two in every state, to catch the most waste." |
| 1:20–1:40 | **Validation and coverage.** Open the Validation tab on the national chart, then go back to the map and point at the coverage card. | "The numbers hold up. Our forecast gives 0.95 million tonnes and 50.6 million panels by 2035, against the reported one million and fifty million, with nothing tuned. And the same 100 sites put 88 per cent of the waste within 30 kilometres, against 63 per cent if you only use capital cities." |
| 1:40–2:00 | **Monday use and next steps.** The map zoomed to a capital, with a site panel open. | "On Monday, a pilot administrator can take the 100-site plan with tonnes for every site and year to 2035, and a council can see what's coming in its own postcodes. Next we add road distances and site capacities, and refresh it every month from new CER data." |

## Recording checklist

- Open https://josephks10.github.io/PanelPath/, or run `cd web && npm run dev`.
- Wait for the map tiles to load before you start recording.
- Run the play animation once beforehand, so the tiles are cached and the wave plays smoothly.
- Keep the cursor still while you talk, and move it only when you click.
- The total should come in under 2:00. If it runs long, cut the sentence about the 2,488 candidates first.
