import {
  UserListComponent,
  UserListViewModelProvider,
} from '@components/pages/admin/user';

export const UserListPage = () => {
  return (
    <UserListViewModelProvider>
      <UserListComponent />
    </UserListViewModelProvider>
  );
};
