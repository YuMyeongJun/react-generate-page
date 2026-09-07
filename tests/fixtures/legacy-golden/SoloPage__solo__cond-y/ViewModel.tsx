import { createContext } from 'react';

interface ISoloPageViewModel {
  // TODO: ViewModel 인터페이스 정의
}

export const SoloPageViewModel = createContext<ISoloPageViewModel | undefined>(
  undefined,
);

interface Props {
  children: React.ReactNode;
}

export const SoloPageViewModelProvider = ({ children }: Props) => {
  return (
    <SoloPageViewModel.Provider
      value={{
        // TODO: ViewModel 값 정의
      }}
    >
      {children}
    </SoloPageViewModel.Provider>
  );
};
