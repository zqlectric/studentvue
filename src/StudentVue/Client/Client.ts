import { LoginCredentials } from '../../utils/soap/Client/Client.interfaces';
import soap from '../../utils/soap/soap';
import { AdditionalInfo, AdditionalInfoItem, ClassScheduleInfo, StudentInfo } from './Client.interfaces';
import { StudentInfoXMLObject } from './Interfaces/xml/StudentInfo';
import Message from '../Message/Message';
import { MessageXMLObject } from '../Message/Message.xml';
import { AssignmentEventXMLObject, CalendarXMLObject, RegularEventXMLObject } from './Interfaces/xml/Calendar';
import { AssignmentEvent, Calendar, CalendarOptions, Event, HolidayEvent, RegularEvent } from './Interfaces/Calendar';
import { eachMonthOfInterval, isAfter, isBefore, isThisMonth } from 'date-fns';
import { FileResourceXMLObject, GradebookXMLObject, URLResourceXMLObject } from './Interfaces/xml/Gradebook';
import { AttendanceXMLObject } from './Interfaces/xml/Attendance';
import EventType from '../../Constants/EventType';
import _ from 'lodash';
import { Assignment, FileResource, Gradebook, Mark, URLResource, WeightedCategory } from './Interfaces/Gradebook';
import asyncPool from 'tiny-async-pool';
import ResourceType from '../../Constants/ResourceType';
import { AbsentPeriod, Attendance, PeriodInfo } from './Interfaces/Attendance';
import { ScheduleXMLObject } from './Interfaces/xml/Schedule';
import { Schedule } from './Client.interfaces';

export default class Client extends soap.Client {
  private hostUrl: string;
  constructor(credentials: LoginCredentials, hostUrl: string) {
    super(credentials);
    this.hostUrl = hostUrl;
  }

  /**
   * Gets the schedule of the student
   * @param {number} termIndex The index of the term.
   * @returns {Promise<Schedule>} Returns the schedule of the student
   * @example
   * ```js
   * await schedule(0) // -> { term: { index: 0, name: '1st Qtr Progress' }, ... }
   * ```
   */
  public schedule(termIndex?: number): Promise<Schedule> {
    return new Promise(async (res, rej) => {
      try {
        const xmlObject: ScheduleXMLObject = await super.processRequest({
          methodName: 'StudentClassList',
          paramStr: { childIntId: 0, ...(termIndex != null ? { TermIndex: termIndex } : {}) },
        });

        res({
          term: {
            index: Number(xmlObject.StudentClassSchedule[0]['@_TermIndex'][0]),
            name: xmlObject.StudentClassSchedule[0]['@_TermIndexName'][0],
          },
          error: xmlObject.StudentClassSchedule[0]['@_ErrorMessage'][0],
          today: xmlObject.StudentClassSchedule[0].TodayScheduleInfoData[0].SchoolInfos[0].SchoolInfo.map((school) => ({
            name: school['@_SchoolName'][0],
            bellScheduleName: school['@_BellSchedName'][0],
            classes: school.Classes[0].ClassInfo.map(
              (course) =>
                ({
                  period: Number(course['@_Period'][0]),
                  attendanceCode: course.AttendanceCode[0],
                  date: {
                    start: new Date(course['@_StartDate'][0]),
                    end: new Date(course['@_EndDate'][0]),
                  },
                  name: course['@_ClassName'][0],
                  sectionGu: course['@_SectionGU'][0],
                  teacher: {
                    email: course['@_TeacherEmail'][0],
                    emailSubject: course['@_EmailSubject'][0],
                    name: course['@_TeacherName'][0],
                    staffGu: course['@_StaffGU'][0],
                    url: course['@_TeacherURL'][0],
                  },
                } as ClassScheduleInfo)
            ),
          })),
          classes: xmlObject.StudentClassSchedule[0].ClassLists[0].ClassListing.map((studentClass) => ({
            name: studentClass['@_CourseTitle'][0],
            period: Number(studentClass['@_Period'][0]),
            room: studentClass['@_RoomName'][0],
            sectionGu: studentClass['@_SectionGU'][0],
            teacher: {
              name: studentClass['@_Teacher'][0],
              email: studentClass['@_TeacherEmail'][0],
              staffGu: studentClass['@_TeacherStaffGU'][0],
            },
          })),
          terms: xmlObject.StudentClassSchedule[0].TermLists[0].TermListing.map((term) => ({
            date: {
              start: new Date(term['@_BeginDate'][0]),
              end: new Date(term['@_EndDate'][0]),
            },
            index: Number(term['@_TermIndex'][0]),
            name: term['@_TermName'][0],
            schoolYearTermCodeGu: term['@_SchoolYearTrmCodeGU'][0],
          })),
        });
      } catch (e) {
        rej(e);
      }
    });
  }

  /**
   * Returns the attendance of the student
   * @returns {Promise<Attendance>} Returns an Attendance object
   * @example
   * ```js
   * client.attendance()
   *  .then(console.log); // -> { type: 'Period', period: {...}, schoolName: 'University High School', absences: [...], periodInfos: [...] }
   * ```
   */
  public attendance(): Promise<Attendance> {
    return new Promise(async (res, rej) => {
      try {
        const attendanceXMLObject: AttendanceXMLObject = await super.processRequest({
          methodName: 'Attendance',
          paramStr: {
            childIntId: 0,
          },
        });

        const xmlObject = attendanceXMLObject.Attendance[0];

        res({
          type: xmlObject['@_Type'][0],
          period: {
            total: Number(xmlObject['@_PeriodCount'][0]),
            start: Number(xmlObject['@_StartPeriod'][0]),
            end: Number(xmlObject['@_EndPeriod'][0]),
          },
          schoolName: xmlObject['@_SchoolName'][0],
          absences: xmlObject.Absences[0].Absence.map((absence) => ({
            date: new Date(absence['@_AbsenceDate'][0]),
            reason: absence['@_Reason'][0],
            note: absence['@_Note'][0],
            description: absence['@_CodeAllDayDescription'][0],
            periods: absence.Periods[0].Period.map(
              (period) =>
                ({
                  period: Number(period['@_Number'][0]),
                  name: period['@_Name'][0],
                  reason: period['@_Reason'][0],
                  course: period['@_Course'][0],
                  staff: {
                    name: period['@_Staff'][0],
                    staffGu: period['@_StaffGU'][0],
                    email: period['@_StaffEMail'][0],
                  },
                  orgYearGu: period['@_OrgYearGU'][0],
                } as AbsentPeriod)
            ),
          })),
          periodInfos: xmlObject.TotalActivities[0].PeriodTotal.map((pd, i) => ({
            period: Number(pd['@_Number'][0]),
            total: {
              excused: Number(xmlObject.TotalExcused[0].PeriodTotal[i]['@_Total'][0]),
              tardies: Number(xmlObject.TotalTardies[0].PeriodTotal[i]['@_Total'][0]),
              unexcused: Number(xmlObject.TotalUnexcused[0].PeriodTotal[i]['@_Total'][0]),
              activities: Number(xmlObject.TotalActivities[0].PeriodTotal[i]['@_Total'][0]),
              unexcusedTardies: Number(xmlObject.TotalUnexcusedTardies[0].PeriodTotal[i]['@_Total'][0]),
            },
          })) as PeriodInfo[],
        } as Attendance);
      } catch (e) {
        rej(e);
      }
    });
  }

  /**
   * Returns the gradebook of the student
   * @param {number} reportingPeriodIndex The timeframe that the gradebook should return
   * @returns {Promise<Gradebook>} Returns a Gradebook object
   * @example
   * ```js
   * const gradebook = await client.gradebook();
   * console.log(gradebook); // { error: '', type: 'Traditional', reportingPeriod: {...}, courses: [...] };
   *
   * await client.gradebook(0) // Some schools will have ReportingPeriodIndex 0 as "1st Quarter Progress"
   * await client.gradebook(7) // Some schools will have ReportingPeriodIndex 7 as "4th Quarter"
   * ```
   */
  public gradebook(reportingPeriodIndex?: number): Promise<Gradebook> {
    return new Promise(async (res, rej) => {
      try {
        const xmlObject: GradebookXMLObject = await super.processRequest({
          methodName: 'Gradebook',
          paramStr: { childIntId: 0, ...(reportingPeriodIndex ? { ReportingPeriod: reportingPeriodIndex } : {}) },
        });
        res({
          error: xmlObject.Gradebook[0]['@_ErrorMessage'][0],
          type: xmlObject.Gradebook[0]['@_Type'][0],
          reportingPeriod: {
            current: {
              index:
                reportingPeriodIndex ??
                Number(
                  xmlObject.Gradebook[0].ReportingPeriods[0].ReportPeriod.find(
                    (x) => x['@_GradePeriod'][0] === xmlObject.Gradebook[0].ReportingPeriod[0]['@_GradePeriod'][0]
                  )?.['@_Index'][0]
                ),
              date: {
                start: new Date(xmlObject.Gradebook[0].ReportingPeriod[0]['@_StartDate'][0]),
                end: new Date(xmlObject.Gradebook[0].ReportingPeriod[0]['@_EndDate'][0]),
              },
              name: xmlObject.Gradebook[0].ReportingPeriod[0]['@_GradePeriod'][0],
            },
            available: xmlObject.Gradebook[0].ReportingPeriods[0].ReportPeriod.map((period) => ({
              date: { start: new Date(period['@_StartDate'][0]), end: new Date(period['@_EndDate'][0]) },
              name: period['@_GradePeriod'][0],
              index: Number(period['@_Index'][0]),
            })),
          },
          courses: xmlObject.Gradebook[0].Courses[0].Course.map((course) => ({
            period: Number(course['@_Period'][0]),
            title: course['@_Title'][0],
            room: course['@_Room'][0],
            staff: {
              name: course['@_Staff'][0],
              email: course['@_StaffEMail'][0],
              staffGu: course['@_StaffGU'][0],
            },
            marks: course.Marks[0].Mark.map((mark) => ({
              name: mark['@_MarkName'][0],
              calculatedScore: {
                string: mark['@_CalculatedScoreString'][0],
                raw: Number(mark['@_CalculatedScoreRaw'][0]),
              },
              weightedCategories:
                typeof mark['GradeCalculationSummary'][0] !== 'string'
                  ? mark['GradeCalculationSummary'][0].AssignmentGradeCalc.map(
                      (weighted) =>
                        ({
                          type: weighted['@_Type'][0],
                          calculatedMark: weighted['@_CalculatedMark'][0],
                          weight: {
                            evaluated: weighted['@_WeightedPct'][0],
                            standard: weighted['@_Weight'][0],
                          },
                          points: {
                            current: Number(weighted['@_Points'][0]),
                            possible: Number(weighted['@_PointsPossible'][0]),
                          },
                        } as WeightedCategory)
                    )
                  : [],
              assignments: mark.Assignments[0].Assignment.map((assignment) => ({
                gradebookId: assignment['@_GradebookID'][0],
                name: assignment['@_Measure'][0],
                type: assignment['@_Type'][0],
                date: {
                  start: new Date(assignment['@_Date'][0]),
                  due: new Date(assignment['@_DueDate'][0]),
                },
                score: {
                  type: assignment['@_ScoreType'][0],
                  value: assignment['@_Score'][0],
                },
                points: assignment['@_Points'][0],
                notes: assignment['@_Notes'][0],
                teacherId: assignment['@_TeacherID'][0],
                description: assignment['@_MeasureDescription'][0],
                hasDropbox: JSON.parse(assignment['@_HasDropBox'][0]),
                studentId: assignment['@_StudentID'][0],
                dropboxDate: {
                  start: new Date(assignment['@_DropStartDate'][0]),
                  end: new Date(assignment['@_DropEndDate'][0]),
                },
                resources:
                  typeof assignment.Resources[0] !== 'string'
                    ? (assignment.Resources[0].Resource.map((rsrc) => {
                        switch (rsrc['@_Type'][0]) {
                          case 'File':
                            const fileRsrc = rsrc as FileResourceXMLObject;
                            return {
                              type: ResourceType.FILE,
                              file: {
                                type: fileRsrc['@_FileType'][0],
                                name: fileRsrc['@_FileName'][0],
                                uri: this.hostUrl + fileRsrc['@_ServerFileName'][0],
                              },
                              resource: {
                                date: new Date(fileRsrc['@_ResourceDate'][0]),
                                id: fileRsrc['@_ResourceID'][0],
                                name: fileRsrc['@_ResourceName'][0],
                              },
                            } as FileResource;
                          case 'URL':
                            const urlRsrc = rsrc as URLResourceXMLObject;
                            return {
                              url: urlRsrc['@_URL'][0],
                              type: ResourceType.URL,
                              resource: {
                                date: new Date(urlRsrc['@_ResourceDate'][0]),
                                id: urlRsrc['@_ResourceID'][0],
                                name: urlRsrc['@_ResourceName'][0],
                                description: urlRsrc['@_ResourceDescription'][0],
                              },
                              path: urlRsrc['@_ServerFileName'][0],
                            } as URLResource;
                          default:
                            rej(`Type ${rsrc['@_Type'][0]} does not exist as a type. Add it to type declarations.`);
                        }
                      }) as (FileResource | URLResource)[])
                    : [],
              })) as Assignment[],
            })) as Mark[],
          })),
        } as Gradebook);
      } catch (e) {
        rej(e);
      }
    });
  }

  /**
   * Get a list of messages of the student
   * @returns {Promise<Message[]>} Returns an array of messages of the student
   * @example
   * ```js
   * await client.messages(); // -> [{ id: 'E972F1BC-99A0-4CD0-8D15-B18968B43E08', type: 'StudentActivity', ... }, { id: '86FDA11D-42C7-4249-B003-94B15EB2C8D4', type: 'StudentActivity', ... }]
   * ```
   */
  public messages(): Promise<Message[]> {
    return new Promise(async (res, rej) => {
      try {
        const xmlObject: MessageXMLObject = await super.processRequest({
          methodName: 'GetPXPMessages',
          paramStr: { childIntId: 0 },
        });
        res(
          xmlObject.PXPMessagesData[0].MessageListings[0].MessageListing.map(
            (message) => new Message(message, super.credentials, this.hostUrl)
          )
        );
      } catch (e) {
        rej(e);
      }
    });
  }

  /**
   * Gets the info of a student
   * @returns {Promise<StudentInfo>} StudentInfo object
   * @example
   * ```js
   * studentInfo().then(console.log) // -> { student: { name: 'Evan Davis', nickname: '', lastName: 'Davis' }, ...}
   * ```
   */
  public studentInfo(): Promise<StudentInfo> {
    return new Promise<StudentInfo>(async (res, rej) => {
      try {
        const xmlObjectData: StudentInfoXMLObject = await super.processRequest({
          methodName: 'StudentInfo',
          paramStr: { childIntId: 0 },
        });

        res({
          student: {
            name: xmlObjectData.StudentInfo[0].FormattedName[0],
            lastName: xmlObjectData.StudentInfo[0].Address[0].LastNameGoesBy[0],
            nickname: xmlObjectData.StudentInfo[0].Address[0].NickName[0],
          },
          birthDate: xmlObjectData.StudentInfo[0].Address[0].BirthDate[0],
          track: xmlObjectData.StudentInfo[0].Address[0].Track[0],
          address: xmlObjectData.StudentInfo[0].Address[0].br[0],
          counselor: {
            name: xmlObjectData.StudentInfo[0].Address[0].CounselorName[0],
            email: xmlObjectData.StudentInfo[0].Address[0].CounselorEmail[0],
            staffGu: xmlObjectData.StudentInfo[0].Address[0].CounselorStaffGU[0],
          },
          currentSchool: xmlObjectData.StudentInfo[0].Address[0].CurrentSchool[0],
          dentist: {
            name: xmlObjectData.StudentInfo[0].Address[0].Dentist[0]['@_Name'][0],
            phone: xmlObjectData.StudentInfo[0].Address[0].Dentist[0]['@_Phone'][0],
            extn: xmlObjectData.StudentInfo[0].Address[0].Dentist[0]['@_Extn'][0],
            office: xmlObjectData.StudentInfo[0].Address[0].Dentist[0]['@_Office'][0],
          },
          physician: {
            name: xmlObjectData.StudentInfo[0].Address[0].Physician[0]['@_Name'][0],
            phone: xmlObjectData.StudentInfo[0].Address[0].Physician[0]['@_Phone'][0],
            extn: xmlObjectData.StudentInfo[0].Address[0].Physician[0]['@_Extn'][0],
            hospital: xmlObjectData.StudentInfo[0].Address[0].Physician[0]['@_Hospital'][0],
          },
          email: xmlObjectData.StudentInfo[0].Address[0].EMail[0],
          emergencyContacts: xmlObjectData.StudentInfo[0].Address[0].EmergencyContacts[0].EmergencyContact.map(
            (contact) => ({
              name: contact['@_Name'][0],
              phone: {
                home: contact['@_HomePhone'][0],
                mobile: contact['@_MobilePhone'][0],
                other: contact['@_OtherPhone'][0],
                work: contact['@_WorkPhone'][0],
              },
              relationship: contact['@_Relationship'][0],
            })
          ),
          gender: xmlObjectData.StudentInfo[0].Gender[0],
          grade: xmlObjectData.StudentInfo[0].Grade[0],
          lockerInfoRecords: xmlObjectData.StudentInfo[0].LockerInfoRecords[0],
          homeLanguage: xmlObjectData.StudentInfo[0].Address[0].HomeLanguage[0],
          homeRoom: xmlObjectData.StudentInfo[0].Address[0].HomeRoom[0],
          homeRoomTeacher: {
            email: xmlObjectData.StudentInfo[0].Address[0].HomeRoomTchEMail[0],
            name: xmlObjectData.StudentInfo[0].Address[0].HomeRoomTch[0],
            staffGu: xmlObjectData.StudentInfo[0].Address[0].HomeRoomTchStaffGU[0],
          },
          additionalInfo: xmlObjectData.StudentInfo[0].Address[0].UserDefinedGroupBoxes[0].UserDefinedGroupBox.map(
            (definedBox) => ({
              id: definedBox['@_GroupBoxID'][0],
              type: definedBox['@_GroupBoxLabel'][0],
              vcId: definedBox['@_VCID'][0],
              items: definedBox.UserDefinedItems[0].UserDefinedItem.map((item) => ({
                source: {
                  element: item['@_SourceElement'][0],
                  object: item['@_SourceObject'][0],
                },
                vcId: item['@_VCID'][0],
                value: item['@_Value'][0],
                type: item['@_ItemType'][0],
              })) as AdditionalInfoItem[],
            })
          ) as AdditionalInfo[],
        } as StudentInfo);
      } catch (e) {
        rej(e);
      }
    });
  }

  private fetchEventsWithinInterval(date: Date) {
    return super.processRequest<CalendarXMLObject>({
      methodName: 'StudentCalendar',
      paramStr: { childIntId: 0, RequestDate: date.toISOString() },
    });
  }

  /**
   *
   * @param {CalendarOptions} options Options to provide for calendar method. An interval is required.
   * @returns {Promise<Calendar>} Returns a Calendar object
   * @example
   * ```js
   * client.calendar({ interval: { start: new Date('5/1/2022'), end: new Date('8/1/2021') }, concurrency: null }); // -> Limitless concurrency (not recommended)
   *
   * const calendar = await client.calendar({ interval: { ... }});
   * console.log(calendar); // -> { schoolDate: {...}, outputRange: {...}, events: [...] }
   * ```
   */
  public calendar(options: CalendarOptions): Promise<Calendar> {
    const defaultOptions: CalendarOptions = {
      concurrency: 7,
      ...options,
    };
    return new Promise(async (res, rej) => {
      try {
        let schoolStartDate: Date | number = options.interval.start;
        let schoolEndDate: Date | number = options.interval.end;

        const monthsWithinSchoolYear = eachMonthOfInterval({ start: schoolStartDate, end: schoolEndDate });
        const allEventsWithinSchoolYear: CalendarXMLObject[] =
          defaultOptions.concurrency == null
            ? await Promise.all(monthsWithinSchoolYear.map((date) => this.fetchEventsWithinInterval(date)))
            : await asyncPool(defaultOptions.concurrency, monthsWithinSchoolYear, (date) =>
                this.fetchEventsWithinInterval(date)
              );
        let memo: Calendar | null = null;
        const events = allEventsWithinSchoolYear.reduce((prev, events) => {
          if (memo == null)
            memo = {
              schoolDate: {
                start: new Date(events.CalendarListing[0]['@_SchoolBegDate'][0]),
                end: new Date(events.CalendarListing[0]['@_SchoolEndDate'][0]),
              },
              outputRange: {
                start: schoolStartDate,
                end: schoolEndDate,
              },
              events: [],
            };
          let rest: Calendar = {
            ...memo, // This is to prevent re-initializing Date objects in order to improve performance
            events: [
              ...(prev.events ? prev.events : []),
              ...(events.CalendarListing[0].EventLists[0].EventList.map((event) => {
                switch (event['@_DayType'][0]) {
                  case EventType.ASSIGNMENT: {
                    const assignmentEvent = event as AssignmentEventXMLObject;
                    return {
                      title: assignmentEvent['@_Title'][0],
                      addLinkData: assignmentEvent['@_AddLinkData'][0],
                      agu: assignmentEvent['@_AGU'][0],
                      date: new Date(assignmentEvent['@_Date'][0]),
                      dgu: assignmentEvent['@_DGU'][0],
                      link: assignmentEvent['@_Link'][0],
                      startTime: assignmentEvent['@_StartTime'][0],
                      type: EventType.ASSIGNMENT,
                      viewType: assignmentEvent['@_ViewType'][0],
                    } as AssignmentEvent;
                  }
                  case EventType.HOLIDAY: {
                    return {
                      title: event['@_Title'][0],
                      type: EventType.HOLIDAY,
                      startTime: event['@_StartTime'][0],
                      date: new Date(event['@_Date'][0]),
                    } as HolidayEvent;
                  }
                  case EventType.REGULAR: {
                    const regularEvent = event as RegularEventXMLObject;
                    return {
                      title: regularEvent['@_Title'][0],
                      agu: regularEvent['@_AGU'] ? regularEvent['@_AGU'] : undefined,
                      date: new Date(regularEvent['@_Date'][0]),
                      description: regularEvent['@_EvtDescription'] ? regularEvent['@_EvtDescription'][0] : undefined,
                      dgu: regularEvent['@_DGU'] ? regularEvent['@_DGU'][0] : undefined,
                      link: regularEvent['@_Link'] ? regularEvent['@_Link'][0] : undefined,
                      startTime: regularEvent['@_StartTime'][0],
                      type: EventType.REGULAR,
                      viewType: regularEvent['@_ViewType'] ? regularEvent['@_ViewType'][0] : undefined,
                      addLinkData: regularEvent['@_AddLinkData'] ? regularEvent['@_AddLinkData'][0] : undefined,
                    } as RegularEvent;
                  }
                }
              }) as Event[]),
            ] as Event[],
          };

          return rest;
        }, {} as Calendar);

        res({ ...events, events: _.uniqBy(events.events, (item) => item.title) } as Calendar);
        // res(allEventsWithinSchoolYear);
      } catch (e) {
        rej(e);
      }
    });
  }
}
