/**
 * 歌单管理
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import produce from 'immer';
import {useEffect, useState} from 'react';
import {nanoid} from 'nanoid';
import {ToastAndroid} from 'react-native';
import isSameMusicItem from '@/utils/isSameMusicItem';
import {getStorage, setStorage} from '@/utils/storageUtil';

const defaultSheet: IMusic.IMusicSheetItemBase = {
  id: 'favorite',
  coverImg: undefined,
  title: '我喜欢',
};

let musicSheets = [defaultSheet];
let sheetMusicMap: Record<string, IMusic.IMusicItem[]> = {};

const sheetsCallBacks: Set<Function> = new Set([]);
function notifyMusicSheets() {
  sheetsCallBacks.forEach(cb => {
    cb();
  });
}

async function setupMusicSheet() {
  try {
    const _musicSheets: IMusic.IMusicSheetItemBase[] = await getStorage(
      'music-sheets',
    );
    if (!Array.isArray(_musicSheets)) {
      throw new Error('not exist');
    }
    for (let sheet of _musicSheets) {
      const musicList = await getStorage(sheet.id);
      sheetMusicMap = produce(sheetMusicMap, _ => {
        _[sheet.id] = musicList;
        return _;
      })
    }
    musicSheets = _musicSheets;
  } catch (e: any) {
    if (e.message === 'not exist') {
      await setStorage('music-sheets', [defaultSheet]);
      await setStorage(defaultSheet.id, []);
      musicSheets = [defaultSheet];
      sheetMusicMap[defaultSheet.id] = [];
    }
  }
  notifyMusicSheets();
}

async function updateAndSaveSheet(
  id: string,
  {
    basic,
    musicList,
  }: {
    basic?: Partial<IMusic.IMusicSheetItemBase>;
    musicList?: IMusic.IMusicItem[];
  },
) {
  const targetSheetIndex = musicSheets.findIndex(_ => _.id === id);
  if (targetSheetIndex === -1) {
    return;
  }
  if (basic) {
    const newMusicSheet = produce(musicSheets, draft => {
      draft[targetSheetIndex] = {
        ...draft[targetSheetIndex],
        ...basic,
        id,
      };
      return draft;
    });
    await setStorage('music-sheets', newMusicSheet);
    musicSheets = newMusicSheet;
  }
  if (musicList) {
    await setStorage(id, musicList);
    sheetMusicMap = produce(sheetMusicMap, _ => {
        _[id] = musicList
      })
  }
  notifyMusicSheets();
}

async function addSheet(title: string) {
  const newId = nanoid();
  const newSheets: IMusic.IMusicSheetItemBase[] = [
    ...musicSheets,
    {
      title,
      id: newId,
      coverImg: undefined,
    },
  ];
  await setStorage('music-sheets', newSheets);
  await setStorage(newId, []);

  musicSheets = newSheets;
  sheetMusicMap = produce(sheetMusicMap, _ => {
    _[newId] = []
  });
  notifyMusicSheets();
}

async function removeSheet(sheetId: string) {
  if (sheetId !== 'favorite') {
    const newSheets = musicSheets.filter(item => item.id !== sheetId);
    await AsyncStorage.removeItem(sheetId);
    await setStorage('music-sheets', newSheets);
    musicSheets = newSheets;
    sheetMusicMap = produce(sheetMusicMap, _ => {
        _[sheetId] = []
        delete _[sheetId];
      })
    notifyMusicSheets();
  }
}

async function addMusic(
  sheetId: string,
  musicItem: IMusic.IMusicItem | Array<IMusic.IMusicItem>,
) {
  if (!Array.isArray(musicItem)) {
    musicItem = [musicItem];
  }
  const musicList = sheetMusicMap[sheetId] ?? [];
  musicItem = musicItem.filter(
    item => musicList.findIndex(_ => isSameMusicItem(_, item)) === -1,
  );
  const newMusicList = musicList.concat(musicItem);
  updateAndSaveSheet(sheetId, {
    basic: {
      coverImg: newMusicList[newMusicList.length - 1]?.artwork,
    },
    musicList: newMusicList,
  });
  notifyMusicSheets();
}

async function removeMusicByIndex(sheetId: string, indices: number | number[]) {
  if (!Array.isArray(indices)) {
    indices = [indices];
  }
  const musicList = sheetMusicMap[sheetId] ?? [];
  const newMusicList = produce(musicList, draft => {
    draft = draft.filter((_, index) => {
      return !(indices as number[]).includes(index);
    });
    return draft;
  });
  updateAndSaveSheet(sheetId, {
    basic: {
      coverImg: newMusicList[newMusicList.length - 1]?.artwork,
    },
    musicList: newMusicList,
  });
  notifyMusicSheets();
}

async function removeMusic(
  sheetId: string,
  musicItems: IMusic.IMusicItem | IMusic.IMusicItem[],
) {
  if (!Array.isArray(musicItems)) {
    musicItems = [musicItems];
  }

  const musicList = sheetMusicMap[sheetId] ?? [];
  const indices = musicItems
    .map(musicItem => musicList.findIndex(_ => isSameMusicItem(_, musicItem)))
    .filter(_ => _ !== -1);
  await removeMusicByIndex(sheetId, indices);
}

function getSheetItems(): IMusic.IMusicSheetItem[]{
    return produce(musicSheets as IMusic.IMusicSheetItem[], draft => {
        draft.forEach(_ => {
            _.musicList = sheetMusicMap[_.id] ?? [];
        })
    })
}

function useSheets(): IMusic.IMusicSheet;
function useSheets(sheetId: string): IMusic.IMusicSheetItem;
function useSheets(sheetId?: string) {
  const [_musicSheets, _setMusicSheets] = useState<IMusic.IMusicSheetItem[]>(getSheetItems);
  

  const _notifyCb = () => {
    _setMusicSheets(getSheetItems());
  };

  useEffect(() => {
    sheetsCallBacks.add(_notifyCb);
    return () => {
      sheetsCallBacks.delete(_notifyCb);
    };
  }, []);
  return sheetId ? _musicSheets?.find(_ => _.id === sheetId) : _musicSheets;
}

function useUserSheets(): IMusic.IMusicSheet {
  const sheets = useSheets();
  return sheets?.filter(_ => _.id !== 'favorite') ?? [];
}

const MusicSheet = {
  setupMusicSheet,
  addSheet,
  addMusic,
  useSheets,
  removeSheet,
  removeMusicByIndex,
  removeMusic,
  useUserSheets,
};
// useUserSheets,

export default MusicSheet;