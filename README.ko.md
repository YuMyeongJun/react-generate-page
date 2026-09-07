# @mj_yu/react-generate-page

**우리 팀의** 폴더 규약대로 리액트 페이지(컴포넌트 · 뷰모델 · 라우트 진입점 · 배럴
export)를 만들고, 만든 것이 정말 컴파일되는지 검사한다.

- **런타임 의존성 0.** 설치해도 트리에 패키지 하나만 늘어난다.
- **설정 파일로 정한다.** 폴더 이름 · 파일 이름 · 파일 내용 · 물어보는 질문까지 전부
  설정에서 온다. 한 팀의 구조가 코드에 박혀 있지 않다.
- **생성물을 검사한다.** 방금 만든 경로만 골라 그 저장소의 `tsc` · `eslint` · 테스트
  명령에 건다. 빨간불이면 파일을 남기지 않는다.
- **기존 코드를 덮어쓰지 않는다.** 만들 파일 중 하나라도 이미 있으면 아무것도 쓰지
  않고, 무엇이 충돌하는지 알려준다.

English documentation: [README.md](./README.md).

## 설치

```bash
npm install -D @mj_yu/react-generate-page
# 또는
yarn add -D @mj_yu/react-generate-page
```

Node 18 이상이 필요하다.

## 빠르게 시작하기

```bash
# 1. 저장소를 읽어 설정 초안을 만든다. 못 읽은 자리는 TODO 로 남는다.
npx @mj_yu/react-generate-page init

# 2. 무엇이 만들어질지만 본다. 아무것도 쓰지 않는다.
npx @mj_yu/react-generate-page --dry-run admin/user UserList

# 3. 만든다.
npx @mj_yu/react-generate-page admin/user UserList
```

인자를 주지 않으면 물어본다:

```bash
npx @mj_yu/react-generate-page
```

## 왜 plop · hygen 이 아니라 이것인가

둘 다 좋은 도구다. 기능으로 이기려는 게 아니고, 다른 점이 두 가지 있다.

**생성물을 검사한다.** plop 과 hygen 은 파일을 뱉고 끝난다 — 그게 컴파일되는지는
나중에 사용자가 알게 된다. 여기서는 `verify.commands` 가 **방금 만든 경로만** 골라
그 저장소의 도구에 건다. 빨간불이면 파일을 되돌리고, 오류 메시지는 **템플릿**을
가리킨다. 그 템플릿으로 만드는 페이지마다 같은 위반을 찍어내니, 나온 파일을 손으로
고치는 건 다음 실행까지 가려두는 것뿐이다.

**저장소를 읽는다.** `init` 은 `package.json` 의 스크립트를 읽고, 실제 소스에 있는
파일 이름 규약을 **세어서** 설정 초안을 쓴다. 못 읽은 자리는 그럴싸한 값을 채우지
않고 `TODO:` 로 남긴다 — 지어낸 값은 확인된 값처럼 보이고, 사람은 그것을 그냥
넘어간다.

그리고 작게 유지한다. 런타임 의존성이 없어서, 무거운 제너레이터가 못 들어가는
자리에 들어간다.

## 명령

```
npx @mj_yu/react-generate-page [<경로> <페이지명>] [옵션]
npx @mj_yu/react-generate-page init [옵션]
```

| 옵션 | 무엇 |
|---|---|
| `--dry-run` | 무엇이 만들어질지만 보여주고 아무것도 쓰지 않는다 |
| `-y`, `--yes` | 모든 질문에 기본값을 쓴다 |
| `--<플래그>` / `--no-<플래그>` | 설정 플래그를 켜고 끈다. 예: `--searchCondition` |
| `--preset <이름>` | 설정의 프리셋 대신 내장 프리셋을 쓴다 |
| `--config <파일>` | 이 설정 파일을 쓴다 |
| `--cwd <디렉토리>` | 이 디렉토리를 프로젝트 루트로 본다 |
| `--out <파일>` | (`init`) 초안을 여기에 쓴다 |
| `--force` | 멈추지 않고 기존 파일을 덮어쓴다 |
| `--no-verify` | `verify.commands` 를 건너뛴다 |
| `--no-fix` | 검사가 실패해도 `verify.fixCommands` 를 돌리지 않는다 |
| `--keep-on-fail` | 검사가 실패해도 생성한 파일을 남긴다 |
| `-h`, `--help` / `-v`, `--version` | |

`<경로> <페이지명>` 을 주면 질문을 건너뛴다 — 그래서 스크립트와 CI 에서 쓸 수 있다.
남은 질문까지 기본값으로 넘기려면 `--yes` 를 붙인다. 없으면, 터미널이 아닌 곳에서
실행됐을 때 **짐작하지 않고 무엇이 안 답해졌는지 말하며 멈춘다.**

## 설정

프로젝트 루트에 `generate-page.config.json` · `.mjs` · `.js` · `.cjs` · `.ts` 중
하나를 두면 된다. 템플릿은 여러 줄이고 주석도 달 수 있으니 `.mjs` 가 가장 쓸모 있다.

> `.ts` 는 평범한 동적 `import` 로 읽으므로, 타입 스트리핑이 내장된 Node 22.6+
> 에서만 된다. TypeScript 로더를 같이 넣지 않는다 — 그건 런타임 의존성이 된다.
> 낮은 Node 라면 `.mjs` 를 써라.

```js
// generate-page.config.mjs
export default {
  preset: "react-mvvm",   // 내장 프리셋에서 시작한다
  root: "src",            // 프로젝트 기준 소스 루트

  vars: {
    // 템플릿에서 쓸 추가 토큰. 값 자체도 템플릿이다.
    componentsAlias: "@components/pages",
  },

  flags: [
    // y/N 질문. id 를 템플릿과 `when:` 이 참조한다.
    { id: "searchCondition", label: "검색 조건이 필요한 화면인가요?", default: false },
  ],

  targets: [
    {
      id: "component",
      dir: "components/pages/{{path}}",  // `root` 아래
      parentIndex: true,                 // 상위 index.ts 배럴까지 결선한다
      files: [
        {
          name: "{{Name}}Component.tsx",
          template: "export const {{Name}}Component = () => <div />;\n",
        },
        {
          name: "{{Name}}Condition.tsx",
          when: "searchCondition",       // 그 플래그가 켜졌을 때만
          templateFile: "./templates/condition.tsx.tpl",
        },
      ],
    },
  ],

  verify: {
    // 프로젝트 루트에서, PATH 앞에 ./node_modules/.bin 을 붙여 돌린다.
    commands: ["tsc --noEmit {{files}}", "eslint {{files}}"],
    fixCommands: ["eslint --fix {{files}}"],  // 한 번 돌리고 다시 검사한다
    selfFix: true,
    revertOnFail: true,
  },
};
```

최상위 키는 프리셋 위에 얕게 병합된다. **배열은 이어붙이지 않고 교체한다** —
`targets` 를 주면 프리셋의 targets 를 통째로 대신한다.

### 템플릿 문법

| | |
|---|---|
| `{{Name}}` | 페이지명, PascalCase |
| `{{name}}` | camelCase |
| `{{kebab}}` | kebab-case |
| `{{path}}` | 입력한 페이지 경로 |
| `{{root}}` | 설정한 소스 루트 |
| `{{#if 플래그}}…{{/if}}` | 플래그가 켜졌을 때 본문을 남긴다 |
| `{{#unless 플래그}}…{{/unless}}` | 그 반대 |

알아둘 규칙 두 개.

- **공백을 다듬지 않는다.** 조건 본문은 그대로 끼워넣는다. 나오는 것은 사람이 읽는
  소스 코드이고, 들여쓰기도 그 일부다.
- **모르는 토큰은 빈 문자열이 아니라 오류다.** 오타는 설정을 읽는 시점에, 아무것도
  쓰기 전에 잡는다. 남의 컴포넌트에 `{{Nmae}}` 를 써넣고 성공했다고 말하는 제너레이터는
  실패한 것이다.

JSX 자신의 이중 중괄호(`value={{ ... }}`)는 건드리지 않는다.

### 검사 명령

`{{files}}` · `{{dirs}}` 는 방금 만든 경로로 치환된다(셸 인용 처리됨). **범위가
중요하다** — 저장소 전체를 린트해서 원래 있던 오류를 새 페이지 탓으로 돌리면,
사람은 관문을 무시하는 법부터 배운다.

`fixCommands` 는 직접 적는 것이다. 이 패키지에는 모델이 없고 모델을 올릴 의존성도
없다. 그래서 「자가 수정」은 **그 저장소가 이미 가진 수리 도구**(`eslint --fix`,
포매터)를 돌리고 `commands` 를 한 번 다시 재는 것을 뜻한다. 어느 명령이 수리할 수
있는지 짐작하지 않는다.

기본 설정의 `commands` 는 비어 있다. 그 저장소를 읽어 보지 않았으니 거기서
「통과」가 무엇인지 모른다. `init` 이 채워 준다.

### 프리셋

| 이름 | 무엇 |
|---|---|
| `react-mvvm` | **기본값.** Component / ViewModel / Page / Condition + `models/interfaces` · `models/types` · `hooks/client`. 0.1.37 까지의 출력과 바이트 단위로 같다. |
| `next-app` | Next.js app router — `page.tsx`, 선택적 `loading.tsx` · `error.tsx` |
| `remix` | Remix / React Router 파일 라우트, 선택적 loader |
| `vue` | Vue 3 SFC, 선택적 컴포저블 |

`react-mvvm` 은 이미 배포된 동작의 복사본이고, 0.1.37 에서 떠온 픽스처로 테스트가
고정하고 있다. 나머지 셋은 **초안**이다 — 그 종류의 실제 저장소에 대고 재보지
않았으니, `--dry-run` 으로 보고 고쳐 쓴 다음에 믿어라.

## 기존 파일은 안전하다

만들 파일 중 하나라도 이미 있으면 아무것도 쓰지 않는다:

```
Refusing to generate: 2 paths already exist.

  src/components/pages/admin/user/UserListComponent.tsx  (file exists)
  src/pages/admin/user/UserListPage.tsx                  (file exists)

Nothing was written. Delete or move these, or generate under a different
page path. Use --dry-run to see the full list of files first.
```

전부 아니면 아무것도, 로 정한 이유가 있다. 반쯤 생성된 페이지는 없는 것보다 나쁘다 —
어느 쪽이 내가 쓴 것인지 보고 알 수 없다. `--force` 로 넘길 수 있다.

배럴 `index.ts` 는 예외다. 교체하지 않고 export 한 줄을 덧붙이며, 이미 있는 export 는
중복해서 넣지 않는다.

## 0.1.x 에서 올라올 때

**지금 동작이 기본값이다.** 설정 파일이 없으면 `react-mvvm` 프리셋을 쓰고, 그 출력은
0.1.37 에서 떠온 픽스처와 바이트 단위로 비교된다 — 그 판의 겉모습 특이점 두 개
(`Component.tsx` 가 빈 줄로 시작하는 것, 검색 조건이 없을 때 공백 여섯 칸짜리 줄이
남는 것)까지 **일부러 그대로 뒀다.** 남의 파일이 괜히 바뀌지 않게 하기 위해서다.

일부러 바꾼 것:

- **`<경로> <페이지명>` 인자가 이제 동작한다.** 문서에는 있었지만 무시되고 있었다.
  `process.argv.length < 2` 라는 조건은 참이 되는 일이 없고, 그 값들은 질문 결과로
  덮여 쓰였다. 명령줄 모드는 늘 질문을 했다.
- **터미널이 아닌 곳에서 조용히 아무 일도 안 하지 않는다.** 질문마다 readline 을 새로
  만들고 닫았는데, 파이프에서는 첫 `close()` 가 스트림을 끝내 버려 두 번째 질문이
  영원히 답을 못 받고 **아무것도 안 쓴 채 exit 0** 이 됐다. 이제 파이프·스크립트에서
  되든가, 크게 실패한다.
- **기존 파일을 덮어쓰지 않는다.** 생성 파일 전부가 조건 없는 `writeFileSync` 여서,
  다시 돌리면 손으로 고친 컴포넌트가 사라졌다. 위 절을 보라.
- **배럴 export 를 줄 단위로 맞춘다.** 예전의 부분 문자열 검사
  (`content.includes(childDir)`)는 배럴에 `detailView` 만 있어도 `detail` 이 이미
  export 된 것으로 세어, 진짜 export 를 넣지 않았고 그 페이지는 import 되지 않았다.
- 페이지 경로를 검사한다 — `..` 금지, 앞의 `/` 금지, `verify.commands` 를 통해 셸에
  닿을 수 있는 문자 금지.
- 대화형 질문이 영어로 바뀌었다. **질문 문구만** 그렇다 — 생성되는
  `Condition.tsx` 의 한국어 문자열은 그대로이고, 파리티 테스트가 그것을 고정한다.
  설정에서 `flags[].label` 을 바꾸면 원하는 문구로 물어본다.

`generateModelIndex()` 는 소스에 있었지만 **한 번도 호출되지 않았다.** 그래서
`// Add model exports here` 문자열은 어떤 판에서도 나온 적이 없다. 선택적
`models/*` · `hooks/client` 배럴은 예전처럼 빈 파일로 만들어진다.

## 개발

```bash
yarn install
yarn typecheck
yarn test          # dist-test/ 로 컴파일하고 node:test 를 돌린다
yarn build         # dist/ 를 낸다
```

계획은 순수 함수다 — `buildPlan(config, answers)` 는 디스크를 건드리지 않고 파일
목록과 내용을 돌려준다. 그래서 `--dry-run` 이 어림이 아니라 정확하고, 출력이 그냥
문자열로 테스트된다.

`tests/legacy-parity.test.ts` 가 배포된 동작을 지키는 그물이다. 여기가 빨간불이면
누군가의 저장소에 있는 생성 코드가 바뀌려는 것이다. 그게 의도일 때도 있지만,
**사고여서는 안 된다.**

## 라이선스

MIT
