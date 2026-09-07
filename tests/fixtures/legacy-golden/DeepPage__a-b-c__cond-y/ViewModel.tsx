import { createContext } from 'react';

interface IDeepPageViewModel {
  // TODO: ViewModel 인터페이스 정의
}

export const DeepPageViewModel = createContext<IDeepPageViewModel | undefined>(
  undefined,
);

interface Props {
  children: React.ReactNode;
}

export const DeepPageViewModelProvider = ({ children }: Props) => {
  return (
    <DeepPageViewModel.Provider
      value={{
        // TODO: ViewModel 값 정의
      }}
    >
      {children}
    </DeepPageViewModel.Provider>
  );
};
