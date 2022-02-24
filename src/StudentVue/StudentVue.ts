import { SchoolDistrict, UserCredentials } from './StudentVue.interfaces';
import Client from './Client/Client';
import soap from '../utils/soap/soap';
import { DistrictListXMLObject } from './StudentVue.xml';
import RequestException from './RequestException/RequestException';
import url from 'url';
import { StudentInfo } from './Client/Client.interfaces';

export { Client };
export default class StudentVue {
  public static login(districtUrl: string, credentials: UserCredentials): Promise<[Client, StudentInfo]> {
    return new Promise(async (res, rej) => {
      if (districtUrl.length === 0)
        return rej(new RequestException({ message: 'District URL cannot be an empty string' }));
      try {
        const host = url.parse(districtUrl).host;
        const endpoint: string = `https://${host}/Service/PXPCommunication.asmx`;
        const client = new Client(credentials.username, credentials.password, endpoint, `https://${host}/`);
        const studentInfo = await client.studentInfo();
        res([client, studentInfo]);
      } catch (e) {
        rej(e);
      }
    });
  }

  public static findDistricts(zipCode: string): Promise<SchoolDistrict[]> {
    return new Promise(async (res, reject) => {
      try {
        const xmlObject: DistrictListXMLObject | undefined = await soap.Client.processAnonymousRequest(
          'https://support.edupoint.com/Service/HDInfoCommunication.asmx',
          {
            paramStr: {
              Key: '5E4B7859-B805-474B-A833-FDB15D205D40',
              MatchToDistrictZipCode: zipCode,
            },
          }
        );

        if (!xmlObject || !xmlObject.DistrictLists.DistrictInfos.DistrictInfo) return res([]);
        res(
          xmlObject.DistrictLists.DistrictInfos.DistrictInfo.map((district) => ({
            parentVueUrl: district['@_PvueURL'],
            address: district['@_Address'],
            id: district['@_DistrictID'],
            name: district['@_Name'],
          }))
        );
      } catch (e) {
        reject(e);
      }
    });
  }
}
