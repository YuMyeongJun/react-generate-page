import { createContext } from 'react';

interface IUserListViewModel {
  // TODO: ViewModel 인터페이스 정의
}

export const UserListViewModel = createContext<IUserListViewModel | undefined>(
  undefined,
);

interface Props {
  children: React.ReactNode;
}

export const UserListViewModelProvider = ({ children }: Props) => {
  return (
    <UserListViewModel.Provider
      value={{
        // TODO: ViewModel 값 정의
      }}
    >
      {children}
    </UserListViewModel.Provider>
  );
};
