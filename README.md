# react-generate-page
리액트 자료구조를 기반으로 페이지 자동 생성 제너레이터

## 🎯 페이지 생성하기

새로운 페이지를 빠르게 생성하기 위한 제너레이터를 제공합니다.

### 1. 설치
```bash
# npm
npm install -D @mj_yu/react-generate-page

# yarn
yarn add -D @mj_yu/react-generate-page
```

### 2. 기본 사용법

두 가지 방식으로 페이지를 생성할 수 있습니다:

#### 대화형 모드
```bash
npx @mj_yu/react-generate-page
```
실행하면 다음과 같이 순차적으로 입력받습니다:
```
📁 페이지 생성 옵션을 선택해주세요:
페이지 경로를 입력해주세요 (예: test/path): test/path
페이지 이름을 입력해주세요 (예: TestPage): TestPage
모델 인터페이스 디렉토리를 생성하시겠습니까? (models/interfaces/test/path/TestPage) (y/N):
모델 타입 디렉토리를 생성하시겠습니까? (models/types/test/path/TestPage) (y/N):
훅스 디렉토리를 생성하시겠습니까? (hooks/client/test/path/TestPage) (y/N):
```

#### 명령줄 인자 모드
```bash
npx @mj_yu/react-generate-page <경로> <페이지명>

# 예시
npx @mj_yu/react-generate-page test/path TestPage
```

### 3. 생성되는 파일 구조

기본적으로 다음과 같은 파일 구조가 생성됩니다:
```
src/
├─ components/pages/test/path/TestPage/
│  ├─ TestPageComponent.tsx
│  ├─ TestPageViewModel.tsx
│  └─ index.ts
└─ pages/test/path/TestPage/
   ├─ TestPagePage.tsx
   └─ index.ts
```

### 4. 선택적 디렉토리 생성

대화형 모드에서 'y'를 선택하면 다음 디렉토리들이 추가로 생성됩니다:
```
src/
├─ models/interfaces/test/path/TestPage/
│  └─ index.ts
├─ models/types/test/path/TestPage/
│  └─ index.ts
└─ hooks/client/test/path/TestPage/
   └─ index.ts
```

### 5. 자동 생성되는 기능
- 각 디렉토리에 `index.ts` 파일 자동 생성
- 상위 디렉토리의 `index.ts` 파일에 export 구문 자동 추가
- 파일명은 PascalCase로 자동 변환 (예: testPage → TestPage)
- 폴더명은 입력한 형태 그대로 유지

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
    <div></div>
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