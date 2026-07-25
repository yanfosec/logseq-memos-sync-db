type Base = {
  updatedTs: number;
  createdTs: number;
};

export type Resource = {
  id: string;
  filename: string;
  externalLink: string;
  type: string;
  size: number;
} & Base;

export type Memo = {
  content: string;
  id: string;
  rowStatus: string;
  visibility: string;
  displayTs: number;
  creatorId: number;
  pinned: boolean;
  creatorName: string;
  creatorUsername: string;
  resourceList: Resource[];
  relationList: [];
} & Base;
