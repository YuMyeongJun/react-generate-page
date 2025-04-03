# react-generate-page
리액트 자료구조를 기반으로 페이지 자동 생성 제너레이터

## 🎯 페이지 생성하기

새로운 페이지를 빠르게 생성하기 위한 제너레이터를 제공합니다.

1. **설치**
   ```bash
   # npm
   npm install -D @jammin/react-generate-page
   
   # yarn
   yarn add -D @jammin/react-generate-page
   ```

2. **페이지 생성 명령어**
   ```bash
   npx generate-page <경로>/<페이지명>
   
   # 예시
   npx generate-page testPath/testPage
   ```

## 📁 프로젝트 구조

```
src/
├─ components/pages/[경로]/[페이지명]/
│  ├─ [페이지명]Component.tsx   # 실제 UI 컴포넌트
│  ├─ [페이지명]ViewModel.tsx   # 상태 관리 및 비즈니스 로직
│  └─ index.ts                  # 컴포넌트 export
└─ pages/[경로]/[페이지명]/
   ├─ [페이지명]Page.tsx        # 페이지 진입점
   └─ index.ts                  # 페이지 export
```

## 🎨 생성되는 컴포넌트 구조

### Component (`[페이지명]Component.tsx`)
```typescript
export const TestPageComponent = () => {
  return (
    <div className="p-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">페이지 제목</h1>
        <p className="text-gray-600">페이지 설명</p>
      </div>
      <div className="bg-white rounded-lg shadow p-4">
        {/* 컴포넌트 내용 */}
      </div>
    </div>
  );
};
```

### ViewModel (`[페이지명]ViewModel.tsx`)
```typescript
import { createContext } from 'react';

interface ITestPageViewModel {
  // ViewModel 인터페이스 정의
}

export const TestPageViewModel = createContext<ITestPageViewModel | undefined>(undefined);

interface Props {
  children: React.ReactNode;
}

export const TestPageViewModelProvider = ({ children }: Props) => {
  return (
    <TestPageViewModel.Provider value={{
      // ViewModel 값 정의
    }}>
      {children}
    </TestPageViewModel.Provider>
  );
};
```

### Page (`[페이지명]Page.tsx`)
```typescript
import { TestPageComponent, TestPageViewModelProvider } from '@components/pages/testPath/testPage';

export const TestPagePage = () => {
  return (
    <TestPageViewModelProvider>
      <TestPageComponent />
    </TestPageViewModelProvider>
  );
};
```

## ⚙️ Path Alias 설정

프로젝트는 다음과 같은 path alias를 사용합니다:

```json
{
  "paths": {
    "@components": ["src/components"],
    "@components/*": ["src/components/*"],
    "@models": ["src/models"],
    "@models/*": ["src/models/*"],
    "@modules": ["src/modules"],
    "@modules/*": ["src/modules/*"],
    "@assets": ["src/assets"],
    "@assets/*": ["src/assets/*"],
    "@hooks": ["src/hooks"],
    "@hooks/*": ["src/hooks/*"],
    "@store": ["src/store"],
    "@store/*": ["src/store/*"],
    "@styles/*": ["src/styles/*"],
    "@icons": ["src/assets/icons"],
    "@icons/*": ["src/assets/icons/*"],
    "@images": ["src/assets/images"],
    "@images/*": ["src/assets/images/*"]
  }
}
```

생성되는 모든 컴포넌트는 이 path alias를 사용하여 import 구문이 자동으로 생성됩니다.

## 🤖 자동 PR 리뷰 설정 (Graphite Diamond)

Graphite Diamond를 사용하여 자동 PR 리뷰를 설정할 수 있습니다.

### 1. 필수 설정

#### 리포지토리 기본 설정

Settings → General에서 다음 설정을 적용:

```
✓ Pull Requests 섹션:
  - [ ] Allow merge commits (비활성화)
  - [x] Allow squash merging (활성화)
  - [x] Allow rebase merging (활성화)
  - [x] Automatically delete head branches (활성화)

✓ Push Protection 섹션:
  - [ ] Limit how many branches... (비활성화)
```

#### 브랜치 보호 규칙

Settings → Branches → Add rule에서 다음 설정을 적용:

```
Branch name pattern: main

✓ 보호 규칙:
  - [x] Require a pull request before merging
      └─ Required number of approvals: 1
      └─ [ ] Dismiss stale pull request approvals (비활성화)
  - [x] Require status checks to pass
  - [x] Require conversation resolution
  - [x] Require linear history
  - [ ] Include administrators (비활성화)
```

### 2. Graphite Diamond 설치

1. [Graphite Diamond App](https://github.com/apps/graphite-code-review)을 GitHub 리포지토리에 설치
2. PR 생성 시 자동으로 코드 리뷰 수행
3. 코드 스타일, 패턴 및 모범 사례 검사

자동 리뷰는 다음 규칙들을 검사합니다:
- 컴포넌트 Props 인터페이스 명명 규칙
- ViewModel 인터페이스 및 Context 패턴
- 올바른 import path 사용
- 파일 및 컴포넌트 명명 규칙

### 3. CI 워크플로우 (선택사항)

추가적인 코드 품질 검사를 원하는 경우, 다음과 같은 CI 워크플로우를 설정할 수 있습니다:

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  pull_request:
    types: [opened, synchronize, reopened]
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'yarn'
          
      - name: Install dependencies
        run: yarn install --frozen-lockfile
        
      - name: Type check
        run: yarn tsc --noEmit
        
      - name: Lint
        run: yarn eslint .
```

이 워크플로우는 TypeScript 타입 체크와 ESLint 검사를 수행합니다.
