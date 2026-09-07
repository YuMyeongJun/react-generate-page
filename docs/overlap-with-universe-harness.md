# react-generate-page 와 universe-harness 의 겹침

⛔ **이 문서는 결정이 아니라 제안서다.** 어느 쪽으로 갈지는 사람이 정한다.
아래는 2026-09-07 에 두 저장소를 **읽어서 실측한 것**과, 거기서 나오는 선택지다.

universe-harness 는 다른 세션이 작업 중이라 **읽기만 했다. 쓰지 않았다.**

---

## 1. 실측

### 겹치는 것 — bigbang 은 게이트 달린 컴포넌트 제너레이터다

`bigbang/templates/star/` 에 템플릿 **4개**가 있다:

```
__Star__.tsx.tpl        컴포넌트
use__Star__.ts.tpl      상태와 행동
index.ts.tpl            공개 표면
__Star__.test.tsx.tpl   행동 계약
```

`bigbang/README.md` 가 스스로 적어놓은 성질이 react-generate-page 와 같다:

| 성질 | bigbang | react-generate-page |
|---|---|---|
| 템플릿에서 파일 여러 개를 만든다 | ✅ 별 하나에 4개 | ✅ 페이지 하나에 N개 (설정) |
| 이미 있으면 **아무것도 쓰지 않고 멈춘다** | ✅ | ✅ `findConflicts` |
| 만든 것을 검사에 건다 | ✅ 관문 · 게이트 | ✅ `verify.commands` |
| 빨간불이면 되돌린다 | ✅ 기본 되돌리기 | ✅ `revertOnFail` |
| 실패는 **템플릿을 고쳐라**고 말한다 | ✅ README 에 명시 | ✅ `formatVerifyFailure` |
| 런타임 의존성 | **0** | **0** |

플래그까지 겹친다 — `--dry-run` · `--keep-on-fail` · `--no-fix` · `--base` · `--out`
**다섯 개가 이름과 뜻이 같다.** 서로 베낀 게 아니라 같은 문제를 각자 풀어서 같은
결론에 도달한 것이다. 그래서 겹침이 우연이 아니고, 저절로 사라지지도 않는다.

설정 모양도 수렴했다:

| universe-harness (galaxy / fe-harness) | react-generate-page |
|---|---|
| `commands.typecheck` · `lintFix` · `lintJson` | `verify.commands` · `verify.fixCommands` |
| `lintTargets[].target` | `{{files}}` · `{{dirs}}` |
| `solarSystems[].srcDir` | `targets[].dir` |
| `project.appDir` | `root` |
| `laws[]` (은하마다 켠다) | — **없다** |

### 겹치지 않는 것 — 같은 제품이 아니다

| | react-generate-page | universe-harness |
|---|---|---|
| 배포 | **npm 공개**, 0.2.0 | 엔진 4패키지 전부 `private`, 0.1.0, 미배포, 우주 안에 벤더링 |
| 폴더 규약 | **설정으로 남의 규약을 따른다** | 우주의 법칙을 강제한다 |
| 검사의 성질 | **명령을 돌린다** (`tsc` · `eslint`) | **구문 트리를 읽는다** (규칙 837줄) |
| 프레임워크 | 프리셋 4개 (react-mvvm · next-app · remix · vue) | 플러그인 2개 (`harness-react-vite` · `harness-next`) |
| 단독 실행 | ✅ 저장소 하나만 있으면 된다 | 우주 + 은하 좌표가 필요하다 |
| 법칙 | 없다 | 11개 등재 (`laws/`) |

**핵심 비대칭:** react-generate-page 는 명령만 돌린다. `semantics.md` 가 직접
적어놨듯 **「이 법칙은 lint 가 보지 못한다」** — 즉 우리 게이트로는 원리적으로
못 잡는 것이 harness 쪽에 있다. 반대로 harness 는 남의 폴더 규약을 따르지 못한다.

---

## 2. 지금 놓은 이음새 (이미 있음)

결정을 미루면서도 둘이 겨루지 않게, 두 가지를 **react-generate-page 쪽에만** 넣었다.
universe-harness 는 건드리지 않았다.

**`check` 서브명령** — 생성 없이 이미 있는 파일에 게이트를 건다.

```bash
npx @mj_yu/react-generate-page check src/pages/admin
npx @mj_yu/react-generate-page check --base main
```

게이트가 「방금 만든 파일」만 잴 수 있던 것이 마이그레이션에서 막혔던 자리다.
구조는 생성하지만 로직은 옮겨오고, **깨지는 쪽은 옮겨온 쪽**이다.
사용자 파일을 고치는 것은 `--fix` 를 명시할 때만 한다.

**`fe-harness.config.json` 읽기** — 이미 harness 를 쓰는 저장소면 `init` 이 그 파일에서
`verify` 를 번역해 온다. 규칙 하나: **판정을 바꾸는 플래그는 남기고, 출력만 바꾸는
플래그는 버린다.**

```
commands.lintJson: npx eslint <TARGET> --report-unused-disable-directives --format json -o <OUT>
              ↓
verify.commands:   npx eslint {{files}} --report-unused-disable-directives
```

그리고 **못 하는 것을 못 한다고 적는다** — 초안에 이렇게 남는다:

> the harness also enforces law presets (toss, a11y, tailwind, house-style).
> This generator cannot run those — they read the syntax tree, and it only runs
> commands. Keep using the harness for them; this config covers the
> compile-and-lint half.

이로써 「통과가 무엇이냐」가 **한 곳에만** 적힌다.

---

## 3. 남은 선택지

### 갈래 ① 그냥 둔다 — 다른 청중을 가진 다른 제품

react-generate-page 는 이식 가능한 쪽, harness 는 의견 있는 쪽으로 둔다.
이음새(§2)만 유지한다.

- 👍 아무 협상도 필요 없다. 지금 상태가 그것이다.
- 👎 템플릿 엔진 · 충돌 검사 · 되돌리기 · 게이트 배선이 **두 곳에서 각자 늙는다.**
  한쪽에서 고친 버그가 다른 쪽에 남는다. 지금 이미 그렇다.

### 갈래 ② bigbang 이 react-generate-page 를 쓴다

harness 는 법칙·관문·게이트에 집중하고, 파일 만드는 일은 npm 패키지에 맡긴다.
별 템플릿 4개는 `generate-page.config` 의 프리셋 하나가 된다.

- 👍 생성기가 하나가 된다. 우주의 별 템플릿이 **설정이 되므로 은하마다 다를 수 있다** —
  지금은 우주에 박혀 있다.
- 👍 우주가 의존성 0을 유지한다 (우리도 0이다).
- 👎 우주가 **외부 npm 패키지에 의존**하게 된다. 보존 법칙과 충돌하는지는 내가 판단할
  자리가 아니다.
- 👎 우주 저장소를 고쳐야 한다 → **그 세션과 합의가 필요하다.**

### 갈래 ③ 엔진을 배포해서 우리가 법칙을 부른다

`@core/fe-agent-contracts` 를 npm 에 올리고, react-generate-page 의 `verify` 가
그것을 부를 수 있게 한다.

- 👍 lint 가 못 보는 법칙이 **일반 사용자에게 닿는다.** 지금은 우주를 깐 사람만 쓴다.
- 👎 우리의 **런타임 의존성 0이 깨진다.** 이 패키지가 들어가는 자리를 만들어주는 게
  그 0이다. ⛔ 이걸 깨는 건 내가 반대한다.
- 👎 다만 **`verify.commands` 로 부르면 0이 안 깨진다** — 사용자의 devDependency 로
  깔고 우리는 명령만 돌린다. 이 형태면 갈래 ③이 실제로 가장 싸다.
  ⚠️ 전제: 엔진에 **CLI 진입점과 파일 인자**가 있어야 한다.
  **실측: 없다.** `@core/fe-agent-contracts/package.json` 에 `bin` 이 없고
  `main`·`exports` 만 있다 — 라이브러리다. `process.argv` 를 읽는 파일은
  `src/selftest.ts` 하나이고 그건 자기 시험이지 파일 검사기가 아니다.
  ⇒ 진입점을 **새로 내야 한다.** 작은 일이지만 **우주 쪽 일**이다.

---

## 4. 내 추천

**갈래 ③의 「명령으로 부르는」 형태**가 가장 값싸고 양쪽 성질을 안 깬다:

1. universe-harness 가 계약 규칙에 **파일 목록을 받는 CLI**를 낸다
   (예: `fe-contracts check <files…>`, exit code 로 판정).
   ⚠️ 지금은 없다(§3 갈래 ③ 실측) — 규칙 837줄은 이미 있고 `bin` 만 없다.
   그 세션이 해야 하는 유일한 작업이고, 나머지는 이미 서 있다.
2. react-generate-page 는 아무것도 바꾸지 않는다 — 이미 `verify.commands` 로 부른다.
   `init` 이 그 명령을 발견하면 초안에 넣는다 (§2 와 같은 배선).
3. 생성기는 하나로 합치지 않는다 (갈래 ②는 보류) — 청중이 다르고, 합치는 비용이
   지금 얻는 것보다 크다.

이러면 **의존성 0이 양쪽에서 유지되고**, lint 가 못 보는 법칙이 일반 사용자에게
닿고, 두 저장소가 서로를 import 하지 않는다.

## 5. 사람만 아는 것 — 결정 전에 필요한 정보

⛔ 내가 재서 알 수 없는 것들이다. 짐작하지 않았다.

1. **엔진을 공개 배포할 뜻이 있나?** 지금 4패키지 전부 `private` 이다. 의도인지
   아직 안 한 것인지 나는 모른다.
2. **우주가 외부 패키지에 의존해도 되나?** 보존 법칙(「지식은 우주 안에서 진화한다」)이
   이걸 금지하는지는 그 법칙을 쓴 사람이 판단할 일이다.
3. ~~`fe-agent-contracts` 에 CLI 가 있나?~~ **재봤다: 없다.** 그래서 남는 질문은
   「낼 뜻이 있나」다 — 규칙은 다 있고 `bin` 한 줄과 인자 파싱만 없다.
4. **bigbang 의 별 4파일은 우주의 자산인가, 아니면 은하마다 달라져야 하나?**
   전자면 갈래 ②는 손해다.
