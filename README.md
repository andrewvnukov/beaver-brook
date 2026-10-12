# Бобровый Ручей / Beaver Brook

Уютная головоломка «поверни желоба» для Яндекс Игр: тап по плитке поворачивает деревянный желоб на 90°,
веди воду от родника ко всем клумбам. За политые ручьи — брёвнышки, на них бобёр Тимоша строит деревню
у ручья (8 построек, пассивный и офлайн-доход).

- Превью: https://andrewvnukov.github.io/beaver-brook/
- Билд: `beaver-brook-yandex.zip` (`index.html` + `sfx.js`)
- Карточка консоли: `store-assets/PUBLICATION.md`
- Состояние доводки: `release-state.json`

## Тесты

```
node test/smoke.mjs        # 49 проверок, touch-контекст + мок Yandex SDK в iframe
node test/balance-sim.mjs  # отчёт темпа прогрессии -> test/balance-report.txt
node test/make-assets.mjs  # иконка, обложки RU/EN, скриншоты 1920x1080 RU/EN
```
