import {
  TestPageComponent,
  TestPageViewModelProvider,
} from '@components/pages/test/path';

export const TestPagePage = () => {
  return (
    <TestPageViewModelProvider>
      <TestPageComponent />
    </TestPageViewModelProvider>
  );
};
