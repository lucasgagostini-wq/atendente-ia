import assert from "node:assert/strict";
import {
  calculateTypingDelay,
  remainingTypingDelay,
} from "../lib/typing-delay";

for (let index = 0; index < 40; index += 1) {
  const shortDelay = calculateTypingDelay("Oi, claro.");
  assert.ok(shortDelay >= 2500 && shortDelay <= 3800, `short=${shortDelay}`);

  const mediumDelay = calculateTypingDelay("A opção de 1 foto fica R$ 9,99, e eu te acompanho por aqui até ficar tudo certinho.");
  assert.ok(mediumDelay >= 4500 && mediumDelay <= 5800, `medium=${mediumDelay}`);

  const longDelay = calculateTypingDelay(
    "Consigo te ajudar sim. A restauração é feita com cuidado, foto por foto, e começa depois da confirmação do pagamento. Pode me mandar a foto aqui que eu vejo o melhor caminho e já te explico as opções disponíveis para restaurar com carinho.",
  );
  assert.ok(longDelay >= 6500 && longDelay <= 7800, `long=${longDelay}`);
}

assert.equal(
  remainingTypingDelay({ calculatedDelayMs: 5000, elapsedMs: 2000 }),
  3000,
);
assert.equal(
  remainingTypingDelay({ calculatedDelayMs: 5000, elapsedMs: 6500 }),
  0,
);

console.log("Typing delay scenarios OK");
