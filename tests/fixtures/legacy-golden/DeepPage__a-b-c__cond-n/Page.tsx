import {
  DeepPageComponent,
  DeepPageViewModelProvider,
} from '@components/pages/a/b/c';

export const DeepPagePage = () => {
  return (
    <DeepPageViewModelProvider>
      <DeepPageComponent />
    </DeepPageViewModelProvider>
  );
};
