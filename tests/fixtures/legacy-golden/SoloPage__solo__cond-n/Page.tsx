import {
  SoloPageComponent,
  SoloPageViewModelProvider,
} from '@components/pages/solo';

export const SoloPagePage = () => {
  return (
    <SoloPageViewModelProvider>
      <SoloPageComponent />
    </SoloPageViewModelProvider>
  );
};
