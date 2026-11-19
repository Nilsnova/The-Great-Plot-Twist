# Native revival HUD component evidence

`free-revival-phone.png` shows the native Captain action prompt through the actual wave HUD at
375 × 812. It displays free help and hold progress without a personal price or wallet balance.
The preview supplies a synthetic held state. It does not demonstrate authenticated source
authorization, real combat or concurrent-controller latency acceptance.

```sh
cd frontend
MP_ECO_EVIDENCE_DIR=../docs/evidence/MP-ECO-native-revival npm test -- \
  --maxWorkers=1 tests/pirates/native-revival-dom.test.js
```
