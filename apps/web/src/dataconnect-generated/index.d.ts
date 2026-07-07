import { ConnectorConfig, DataConnect, QueryRef, QueryPromise } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface Document_Key {
  id: UUIDString;
  __typename?: 'Document_Key';
}

export interface Education_Key {
  id: UUIDString;
  __typename?: 'Education_Key';
}

export interface Experience_Key {
  id: UUIDString;
  __typename?: 'Experience_Key';
}

export interface GetMyProfileData {
  profiles: ({
    id: UUIDString;
    name: string;
    contactEmail?: string | null;
    phoneNumber?: string | null;
    linkedinUrl?: string | null;
    portfolioUrl?: string | null;
    address?: string | null;
    summary?: string | null;
    createdAt: TimestampString;
  } & Profile_Key)[];
}

export interface Profile_Key {
  id: UUIDString;
  __typename?: 'Profile_Key';
}

export interface Skill_Key {
  id: UUIDString;
  __typename?: 'Skill_Key';
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

interface GetMyProfileRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetMyProfileData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<GetMyProfileData, undefined>;
  operationName: string;
}
export const getMyProfileRef: GetMyProfileRef;

export function getMyProfile(): QueryPromise<GetMyProfileData, undefined>;
export function getMyProfile(dc: DataConnect): QueryPromise<GetMyProfileData, undefined>;

