# PanelPath

PanelPath forecasts, postcode by postcode, when Australia's rooftop solar panels will be retired and how many tonnes each area will produce, then picks where up to 100 collection sites should go to catch the most waste.

## Validation

![National retirements by scenario against reported figures](outputs/figures/validation_national.png)

Of the three published lifetime curves, the Australian residential curve (`AU_RES`, typical life of 17 years) lands closest to the reported figures: it retires 0.95 Mt and 50.6 million panels from 2015 to 2035, against the reported ~1 Mt and ~50 million (0.95× and 1.01×). Its annual tonnes sit below the reported figures, at 42 kt in 2025 (0.71× the reported ~59 kt) and 76 kt in 2030 (0.83× the reported >91 kt), so if anything the model is conservative. The international curves, which assume panels last about 30 years, come in between 2.6 and 33 times too low (`INTL_EARLY` 0.22–0.38×, `INTL_REGULAR` 0.03–0.13×), which supports the evidence that Australian panels come off roofs long before they wear out.

No parameters were tuned to hit these figures. The full comparison is in `data/processed/validation.json`.
