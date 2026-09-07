import { createContext } from 'react';

interface ITestPageViewModel {
  // TODO: ViewModel 인터페이스 정의
}

export const TestPageViewModel = createContext<ITestPageViewModel | undefined>(
  undefined,
);

interface Props {
  children: React.ReactNode;
}

export const TestPageViewModelProvider = ({ children }: Props) => {
  return (
    <TestPageViewModel.Provider
      value={{
        // TODO: ViewModel 값 정의
      }}
    >
      {children}
    </TestPageViewModel.Provider>
  );
};
