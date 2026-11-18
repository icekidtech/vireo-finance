import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  /** Web only: the browser File to upload. */
  file?: File;
}

/** Opens the system file picker (photos, files, PDFs). Resolves null if the user cancels. */
export async function pickDocument(allowPdf: boolean): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: allowPdf ? ['image/jpeg', 'image/png', 'application/pdf'] : ['image/jpeg', 'image/png'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || result.assets.length === 0) return null;
  const a = result.assets[0];
  return {
    uri: a.uri,
    name: a.name,
    mimeType: a.mimeType ?? 'application/octet-stream',
    file: Platform.OS === 'web' ? (a.file as File | undefined) : undefined,
  };
}
