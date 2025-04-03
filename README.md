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
